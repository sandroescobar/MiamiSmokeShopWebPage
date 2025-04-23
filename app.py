from flask import Flask, render_template, request, redirect, url_for, session, jsonify, json
from flask_mysqldb import MySQL
import MySQLdb.cursors
import re
import os
import socket
from datetime import datetime, timedelta



app = Flask(__name__)


'''
# Secret key for session management
app.secret_key = 'your_secret_key'

# MySQL database configuration
app.config['MYSQL_HOST'] = 'localhost'
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = 'Ae9542790079'  # Replace with your password
app.config['MYSQL_DB'] = 'webPagePractice'

# MySQL connection
mysql = MySQL(app)


'''


app.secret_key = os.getenv("FLASK_SECRET_KEY", "default_secret_key")
print("FLASK_SECRET_KEY:", os.getenv("FLASK_SECRET_KEY"))

app.config['MYSQL_HOST'] = os.getenv("MYSQL_HOST", "monorail.proxy.rlwy.net")
app.config['MYSQL_PORT'] = int(os.getenv("MYSQL_PORT", 22133))
app.config['MYSQL_USER'] = os.getenv("MYSQL_USER", "root")
app.config['MYSQL_PASSWORD'] = os.getenv("MYSQL_PASSWORD", "")
app.config['MYSQL_DB'] = os.getenv("MYSQL_DB", "railway")

# ✅ Force MySQLdb to use TCP/IP instead of socket
app.config['MYSQL_UNIX_SOCKET'] = None

mysql = MySQL(app)




@app.route("/dbtest")
def dbtest():
    host, port = app.config['MYSQL_HOST'], app.config['MYSQL_PORT']
    s = socket.socket(); s.settimeout(5)
    try:
        s.connect((host, port))
        s.close()
        return "✅ TCP OK!"
    except Exception as e:
        return f"❌ TCP ERROR: {e}"





# Function to calculate total hours from time range
def calculate_hours(time_range):
    try:
        start_time, end_time = time_range.split('-')
        
        # Support both '10AM' and '10:30AM'
        start_format = '%I%p' if ':' not in start_time else '%I:%M%p'
        end_format = '%I%p' if ':' not in end_time else '%I:%M%p'
        
        start = datetime.strptime(start_time.strip(), start_format)
        end = datetime.strptime(end_time.strip(), end_format)

        # Handle overnight shifts
        if end < start:
            end += timedelta(days=1)

        total_hours = (end - start).seconds / 3600
        return total_hours

    except Exception as e:
        import traceback
        traceback.print_exc()  # ✅ Logs the full traceback in the server console
        return 0


@app.route('/homePage', methods=['GET', 'POST'])
def homePage():
    if request.method == "GET":
        if 'loggedin' in session:
            return render_template('homePage.html')
        return redirect(url_for('login'))

    elif request.method == "POST":
        if 'loggedin' in session:
            try:
                print("🔹 Received Form Data:")
                print(request.form)  # Logs all incoming form data

                # Collect form data
                store = request.form.get('store')
                days = request.form.getlist('day[]')
                morning_employees = request.form.getlist('morning_employee[]')
                morning_hours = request.form.getlist('morning_hours[]')
                afternoon_employees = request.form.getlist('afternoon_employee[]')
                afternoon_hours = request.form.getlist('afternoon_hours[]')
                tasks = request.form.getlist('tasks[]')

                start_of_week = request.form.get('start_of_week')
                end_of_week = request.form.get('end_of_week')
                employees = request.form.getlist('employeeNames[]')
                hourly_rates = request.form.getlist('hourlyPayRates[]')

                # Debugging Lengths
                print(f"Store: {store}, Days: {len(days)}, Morning Employees: {len(morning_employees)}, Morning Hours: {len(morning_hours)}, Afternoon Employees: {len(afternoon_employees)}, Afternoon Hours: {len(afternoon_hours)}, Tasks: {len(tasks)}")

                # Input validation
                if not (start_of_week and end_of_week and store):
                    return jsonify({"success": False, "message": "Start date, end date, and store selection are required."})

                if not all([days, morning_employees, morning_hours, afternoon_employees, afternoon_hours]):
                    print("❌ Error: One or more lists are empty.")
                    return jsonify({"success": False, "message": "All table fields must be filled."})

                # Database Operations
                cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

                # Insert Schedule Data
                for i in range(len(days)):
                    try:
                        if not all([
                            days[i].strip(),
                            morning_employees[i].strip(),
                            morning_hours[i].strip(),
                            afternoon_employees[i].strip(),
                            afternoon_hours[i].strip()
                        ]):
                            print(f"⚠️ Skipping incomplete row {i + 1}: Missing data.")
                            continue

                        # Calculate total hours from time ranges
                        morning_total_hours = calculate_hours(morning_hours[i])
                        afternoon_total_hours = calculate_hours(afternoon_hours[i])

                        cursor.execute(
                            'INSERT INTO schedule (store, start_of_week, end_of_week, day, morning_employee, morning_hours, afternoon_employee, afternoon_hours, tasks) '
                            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
                            (store, start_of_week, end_of_week, days[i], morning_employees[i], morning_total_hours, afternoon_employees[i], afternoon_total_hours, tasks[i])
                        )
                    except Exception as e:
                        print(f"❌ Error inserting schedule data for row {i + 1}: {str(e)}")
                        mysql.connection.rollback()  # Rollback on error
                        return jsonify({"success": False, "message": f"Database Error (Schedule Insert): {str(e)}"})

                # Insert or Update Employee Data
                for i in range(len(employees)):
                    try:
                        cursor.execute(
                            'INSERT INTO employees (name, hourly_pay, store) VALUES (%s, %s, %s) '
                            'ON DUPLICATE KEY UPDATE hourly_pay = VALUES(hourly_pay)',
                            (employees[i], hourly_rates[i], store)
                        )
                    except Exception as e:
                        print(f"❌ Error inserting/updating employee {employees[i]}: {str(e)}")
                        mysql.connection.rollback()  # Rollback on error
                        return jsonify({"success": False, "message": f"Database Error (Employee Insert/Update): {str(e)}"})

                # Clear Previous Weekly Summary
                try:
                    cursor.execute("DELETE FROM weekly_summary WHERE start_of_week = %s AND store = %s", (start_of_week, store))
                except Exception as e:
                    print(f"❌ Error clearing weekly summary: {str(e)}")
                    mysql.connection.rollback()  # Rollback on error
                    return jsonify({"success": False, "message": f"Database Error (Weekly Summary Delete): {str(e)}"})

                # Insert Weekly Summary
                try:
                    cursor.execute("""
                        INSERT INTO weekly_summary (employee_name, start_of_week, end_of_week, total_hours, total_weekly_pay, store)
                        SELECT 
                            employee_name,
                            %s AS start_of_week,
                            %s AS end_of_week,
                            SUM(total_hours) AS total_hours,
                            SUM(total_weekly_pay) AS total_weekly_pay,
                            %s AS store
                        FROM (
                            SELECT 
                                s.morning_employee AS employee_name,
                                SUM(s.morning_hours) AS total_hours,
                                (SUM(s.morning_hours) * e.hourly_pay) AS total_weekly_pay
                            FROM 
                                schedule s
                            JOIN 
                                employees e
                            ON 
                                s.morning_employee = e.name
                            WHERE 
                                s.start_of_week = %s AND s.store = %s
                            GROUP BY 
                                s.morning_employee
                            UNION ALL
                            SELECT 
                                s.afternoon_employee AS employee_name,
                                SUM(s.afternoon_hours) AS total_hours,
                                (SUM(s.afternoon_hours) * e.hourly_pay) AS total_weekly_pay
                            FROM 
                                schedule s
                            JOIN 
                                employees e
                            ON 
                                s.afternoon_employee = e.name
                            WHERE 
                                s.start_of_week = %s AND s.store = %s
                            GROUP BY 
                                s.afternoon_employee
                        ) AS combined_data
                        GROUP BY 
                            employee_name;
                    """, (start_of_week, end_of_week, store, start_of_week, store, start_of_week, store))
                except Exception as e:
                    print(f"❌ Error inserting weekly summary: {str(e)}")
                    mysql.connection.rollback()  # Rollback on error
                    return jsonify({"success": False, "message": f"Database Error (Weekly Summary Insert): {str(e)}"})

                mysql.connection.commit()
                return jsonify({"success": True, "message": "Data submitted successfully."})

            except Exception as e:
                import traceback
                traceback.print_exc()  # Prints the full error traceback
                mysql.connection.rollback()  # Rollback on general error
                return jsonify({"success": False, "message": f"Server Error: {str(e)}"})

    return jsonify({"success": False, "message": "Unauthorized"})






@app.route('/',methods=['GET', 'POST'])
def login():
    msg = ''
    if request.method == 'POST' and 'email' in request.form and 'password' in request.form:
        email = request.form['email']
        password = request.form['password']
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('SELECT * FROM accounts WHERE email = %s AND password = %s', (email, password))
        account = cursor.fetchone()
        if account:
            session['loggedin'] = True
            session['id'] = account['id']
            session['email'] = account['email']
            msg = 'Logged in successfully!'
            return render_template('homePage.html', msg=msg)
        else:
            flash("Incorrect email or password!", "danger")
            #msg = 'Incorrect email or password!'
    return render_template('login.html', msg=msg)

@app.route('/signUp', methods=['GET', 'POST'])
def signUp():
    msg = ''
    
    # Debugging Print Statements
    print("🔹 MySQL Connection Object:", mysql)
    
    if request.method == 'POST' and 'email' in request.form and 'password' in request.form:
        email = request.form['email']
        password = request.form['password']
        
        print(f"📥 Received Signup Request: Email={email}, Password={password}")
        
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('SELECT * FROM accounts WHERE email = %s', (email,))
        account = cursor.fetchone()
        
        if account:
            msg = 'Account already exists!'
        elif not re.match(r'[^@]+@[^@]+\.[^@]+', email):
            msg = 'Invalid email address!'
        elif not email or not password:
            msg = 'Please fill out the form!'
        else:
            cursor.execute('INSERT INTO accounts (email, password) VALUES (%s, %s)', (email, password))
            mysql.connection.commit()
            msg = 'You have successfully registered!'
            return redirect(url_for('login'))
    
    print("🔹 Signup Error Message:", msg)
    return render_template('signUp.html', msg=msg)


@app.route('/payoutPage', methods=["GET", "POST"])
def payoutPage():
    if request.method == "GET":
        return render_template('payoutPage.html', results=[])

    try:
        data = request.get_json()
        search_query = data.get('query', '')
        selected_store = data.get('store', '')

        cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        if selected_store and selected_store != "All Stores":
            # Filter by both employee and store
            cur.execute("""
                SELECT ws.summary_id, ws.employee_name, ws.start_of_week, ws.end_of_week, 
                       ws.total_hours, ws.total_weekly_pay, s.store
                FROM weekly_summary ws
                JOIN schedule s ON (
                    (ws.employee_name = s.morning_employee OR ws.employee_name = s.afternoon_employee)
                    AND ws.store = s.store
                )
                WHERE (ws.employee_name LIKE %s OR ws.start_of_week LIKE %s OR ws.end_of_week LIKE %s)
                  AND s.store = %s
                GROUP BY ws.summary_id, ws.employee_name, ws.start_of_week, ws.end_of_week, ws.total_hours, ws.total_weekly_pay, s.store
            """, ('%' + search_query + '%', '%' + search_query + '%', '%' + search_query + '%', selected_store))
        else:
            # For "All Stores," include the store field in GROUP BY
            cur.execute("""
                SELECT ws.summary_id, ws.employee_name, ws.start_of_week, ws.end_of_week, 
                       ws.total_hours, ws.total_weekly_pay, s.store
                FROM weekly_summary ws
                JOIN schedule s ON (
                    (ws.employee_name = s.morning_employee OR ws.employee_name = s.afternoon_employee)
                    AND ws.store = s.store
                )
                WHERE ws.employee_name LIKE %s OR ws.start_of_week LIKE %s OR ws.end_of_week LIKE %s
                GROUP BY ws.summary_id, ws.employee_name, ws.start_of_week, ws.end_of_week, ws.total_hours, ws.total_weekly_pay, s.store
            """, ('%' + search_query + '%', '%' + search_query + '%', '%' + search_query + '%'))

        results = cur.fetchall()

        if results:
            return render_template('table_template.html', results=results)
        else:
            return '<h6 class="text-danger text-center mt-3">No data found</h6>'
    except Exception as e:
        return f'<h6 class="text-danger text-center mt-3">Error: {str(e)}</h6>'





@app.route('/modal')
def modal():    
    return render_template('modal.html')  


@app.route('/updateTable', methods=["GET", "POST"])
def updateTable():
    try:
        updatedSchedule = request.json.get("updateTable", [])
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        for row in updatedSchedule:
            cursor.execute("""
                UPDATE schedule 
                SET morning_employee = %s, 
                    morning_hours = %s,
                    afternoon_employee = %s, 
                    afternoon_hours = %s,
                    tasks = %s 
                WHERE day = %s
            """, (row['morning_employee'], row['morning_hours'], row['afternoon_employee'], row['afternoon_hours'], row['tasks'], row['day']))

        mysql.connection.commit()
        return jsonify({"success": True, "message": "Schedule updated successfully!"})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


if __name__ == '__main__':
    app.run(debug=True)
