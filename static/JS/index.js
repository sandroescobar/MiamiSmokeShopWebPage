// index.js

// Array of days for pre-filling the table
var daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const StoreHours = {
    "Calle 8": {
        Monday: { open: 10, close: 22, total: 12 },
        Tuesday: { open: 10, close: 22, total: 12 },
        Wednesday: { open: 10, close: 22, total: 12 },
        Thursday: { open: 10, close: 22, total: 12 },
        Friday: { open: 10, close: 22, total: 12 },
        Saturday: { open: 10, close: 23, total: 13 },
        Sunday: { open: 11, close: 20, total: 9 }
    },
    "79th St": {
        Monday: { open: 10, close: 22, total: 12 },
        Tuesday: { open: 10, close: 22, total: 12 },
        Wednesday: { open: 10, close: 22, total: 12 },
        Thursday: { open: 10, close: 22, total: 12 },
        Friday: { open: 10, close: 24, total: 14 },
        Saturday: { open: 10, close: 24, total: 14 },
        Sunday: { open: 11, close: 20, total: 9 }
    },
    "Miami Market": {
        Monday: { open: 9, close: 22, total: 13 },
        Tuesday: { open: 9, close: 22, total: 13 },
        Wednesday: { open: 9, close: 22, total: 13 },
        Thursday: { open: 9, close: 24, total: 15 },
        Friday: { open: 9, close: 24, total: 15 },
        Saturday: { open: 9, close: 24, total: 15 },
        Sunday: { open: 9, close: 22, total: 13 }
    }
};

let selectedStore = "Calle 8";



function handleTimeRangeInput(inputValue, day, afternoonInput, inputElement) {
    const storeData = StoreHours[selectedStore][day];
    if (!storeData) {
        alert(`No hours defined for ${day} in ${selectedStore}`);
        inputElement.value = "";
        return;
    }

    // Updated pattern comment to reflect that minutes are optional on both sides
    const timePattern = /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s?(am|pm)$/i;
    const match = inputValue.match(timePattern);
    
    if (!match) {
        // Slightly friendlier message
        alert("Invalid format! For example: '10 AM-3 PM' or '9:30 AM-2:15 PM'");
        inputElement.value = "";
        return;
    }

    // Convert to 24-hour time
    const start = convertTo24Hour(`${match[1]}:${match[2] || '00'} ${match[3]}`);
    const end   = convertTo24Hour(`${match[4]}:${match[5] || '00'} ${match[6]}`);

    // Validate store hours
    if (start < storeData.open || end > storeData.close) {
        alert(`Time must be between ${convertTo12Hour(storeData.open)} and ${convertTo12Hour(storeData.close)} for ${day}.`);
        inputElement.value = "";
        return;
    }

    const duration = end - start;
    if (duration > storeData.total) {
        alert(`Exceeds maximum of ${storeData.total} hours for ${day}.`);
        inputElement.value = "";
        return;
    }

    // Calculate 'afternoon' hours automatically
    const afternoonStart = end;
    const afternoonEnd = Math.min(afternoonStart + (storeData.total - duration), storeData.close);
    
    afternoonInput.value = (afternoonStart >= storeData.close)
      ? "Closed"
      : `${convertTo12Hour(afternoonStart)}-${convertTo12Hour(afternoonEnd)}`;
}



function attachMorningHoursListeners() {
    // Grab all the morning_hours inputs
    document.querySelectorAll('input[name="morning_hours[]"]').forEach((input) => {
      // Use 'blur' so the user can type freely before we check
      input.addEventListener("blur", function(e) {
        const row = e.target.closest('tr');
        const day = row.querySelector('input[name="day[]"]').value.trim();
        const afternoonInput = row.querySelector('input[name="afternoon_hours[]"]');
        const value = e.target.value.trim();
        
        // If user cleared the field, just clear the afternoon hours
        if (!value) {
          afternoonInput.value = "";
          return;
        }
  
        // We do *not* check for a dash here anymore.
        // Instead, rely on the regex check inside handleTimeRangeInput.
        handleTimeRangeInput(value, day, afternoonInput, e.target);
      });
    });
  }
  

/* ======================
   IMPROVED CONVERSION FUNCTIONS
   ====================== */

function convertTo24Hour(timeStr) {
    let match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return null;
    
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3].toUpperCase();
    
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    
    return hours + (minutes / 60);
}

function convertTo12Hour(timeFloat) {
    let hours = Math.floor(timeFloat);
    let minutes = Math.round((timeFloat - hours) * 60);
    
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12; // Convert 0 to 12 for AM
    
    return minutes > 0 ? 
        `${hours}:${minutes.toString().padStart(2, '0')} ${period}` :
        `${hours}${period}`;
}

// Keep other functions (setDays, updateStoreHours, handleStoreSelection, etc) unchanged
// Validate and handle time range input (e.g., "10AM-3PM")


/* ======================
   CORE FUNCTIONS
   ====================== */

// Pre-fill day fields in the table with the days of the week
function setDays() {
    let dayInputs = document.querySelectorAll('input[name="day[]"]');
    daysOfWeek.forEach((day, index) => {
        if (dayInputs[index]) {
            dayInputs[index].value = day;
        }
    });
}

// Reset the morning and afternoon hour inputs when the store selection changes
function updateStoreHours() {
    document.querySelectorAll('input[name="morning_hours[]"]').forEach((input) => {
        input.value = "";
    });
    document.querySelectorAll('input[name="afternoon_hours[]"]').forEach((input) => {
        input.value = "";
    });
}

// Handle dropdown selection for choosing the store
function handleStoreSelection() {
    document.querySelectorAll(".dropdown-item").forEach((item) => {
        item.addEventListener("click", function (event) {
            event.preventDefault();

            selectedStore = this.getAttribute("data-store");  // Update the global variable
            console.log("Selected store:", selectedStore);

            document.getElementById("selectedStore").value = selectedStore;

            const dropdownToggle = document.querySelector(".btn.dropdown-toggle");
            if (dropdownToggle) {
                dropdownToggle.textContent = selectedStore;
            }

            updateStoreHours();
        });
    });
}


// Validate that all fields in the table are filled
function validateTable() {
    const rows = document.querySelectorAll("#scheduleTable tbody tr");
    for (let i = 0; i < rows.length; i++) {
        const inputs = rows[i].querySelectorAll("input");
        for (let input of inputs) {
            if (input.value.trim() === "") {
                return false;
            }
        }
    }
    return true;
}

/* ======================
   MODAL LOGIC & INITIALIZATION
   ====================== */




// Populate the employee dropdowns in the modal.

const modalElement = document.getElementById("modalID");

function fetchTableData(modalElement) {
    const tableRows = document.querySelectorAll(".tableRows");
    const uniqueEmployees = new Set();
    tableRows.forEach((row) => {
        const morningEmployee = row.querySelector('input[name="morning_employee[]"]');
        const afternoonEmployee = row.querySelector('input[name="afternoon_employee[]"]');
        if (morningEmployee && morningEmployee.value.trim()) {
            uniqueEmployees.add(morningEmployee.value.trim());
        }
        if (afternoonEmployee && afternoonEmployee.value.trim()) {
            uniqueEmployees.add(afternoonEmployee.value.trim());
        }
    });
    const employeeDropdowns = modalElement.querySelector("#employeeDropdowns");
    if (!employeeDropdowns) return;
    employeeDropdowns.innerHTML = "";
    if (uniqueEmployees.size === 0) return;
    const headerRow = document.createElement("div");
    headerRow.className = "employeeHeaderRow";
    const nameHeader = document.createElement("div");
    nameHeader.textContent = "Employee Name";
    nameHeader.className = "employeeHeader";
    const payHeader = document.createElement("div");
    payHeader.textContent = "Hourly Pay";
    payHeader.className = "employeeHeader";
    headerRow.appendChild(nameHeader);
    headerRow.appendChild(payHeader);
    employeeDropdowns.appendChild(headerRow);
    const container = document.createElement("div");
    container.className = "employeeContainer";
    Array.from(uniqueEmployees).forEach(employeeName => {
        const row = document.createElement("div");
        row.className = "employeeRow";
        const input = document.createElement("input");
        input.name = "employeeNames[]";
        input.value = employeeName;
        input.className = "form-control employeeInput";
        input.readOnly = true;
        const select = document.createElement("select");
        select.name = "hourlyPayRates[]";
        select.className = "form-control paySelect";
        ["$10", "$12", "$15"].forEach(rate => {
            const option = document.createElement("option");
            option.value = rate.replace("$", "");
            option.textContent = rate;
            select.appendChild(option);
        });
        row.appendChild(input);
        row.appendChild(select);
        container.appendChild(row);
    });
    employeeDropdowns.appendChild(container);
    
}

document.addEventListener("DOMContentLoaded", function () {
    setDays();
    attachMorningHoursListeners();
    handleStoreSelection();
    initializeDataTable();

    flatpickr("#startingDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
    });
    flatpickr("#endingDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
    });

    const launchModalButton = document.getElementById("launchModalButton");
    const modalElement = document.getElementById('modalID');

    if (launchModalButton && modalElement) {
        launchModalButton.addEventListener("click", function () {
            if (validateTable()) {
                modalElement.style.display = 'flex';
                fetchTableData(modalElement);
            } else {
                alert("⚠️ Please fill all rows in the table before proceeding.");
            }
        });
    }

    document.querySelectorAll('.closeButton').forEach(button => {
        button.addEventListener('click', () => {
            modalElement.style.display = 'none';
        });
    });
});





document.querySelector(".saveChangeButton").addEventListener("click", async function (e) {
    e.preventDefault(); // Prevent double submission

    const tableForm = document.getElementById("scheduleForm");
    const modalForm = document.getElementById("modalForm");

    // Filter out hidden and disabled inputs
    const allInputs = [...tableForm.querySelectorAll("input:not([type='hidden']):not([disabled])"), 
                        ...modalForm.querySelectorAll("input:not([type='hidden']):not([disabled])")];

    const emptyFields = allInputs.filter(input => input.value.trim() === "");

    if (emptyFields.length > 0) {
        alert("Please fill in all fields before submitting.");
        console.log("Empty Fields:", emptyFields.map(input => input.name)); // Debug to identify which fields are empty
        return;
    }

    const formData = new FormData(tableForm);
    const modalData = new FormData(modalForm);

    // Append modal data to formData
    for (let [key, value] of modalData.entries()) {
        formData.append(key, value);
    }

    // Ensure the store is always included
    const selectedStoreInput = document.getElementById("selectedStore");
    if (!selectedStoreInput.value) {
        selectedStoreInput.value = selectedStore;  // Use the selected store if input is empty
    }
    formData.append("store", selectedStoreInput.value);

    console.log("Submitting Store:", selectedStoreInput.value);  // Debugging

    try {
        const response = await fetch("/homePage", {
            method: "POST",
            body: formData,
        });
        const result = await response.json();

        if (result.success) {
            alert("Data submitted successfully!");
            window.location.href = "/homePage";  // Redirect to homepage after successful submission
        } else {
            alert(result.message || "Error submitting data.");
        }
    } catch (error) {
        console.error("Error submitting data:", error);
        alert("Failed to submit data. Please try again.");
    }
});

/*
function initializeDataTable() {
    $('#scheduleTable').DataTable({
        dom: 'Bfrtip',
        buttons: [
            {
                extend: 'excelHtml5',
                text: 'Export to Excel',
                className: 'buttons-excel',
                customize: function (xlsx) {
                    var sheet = xlsx.xl.worksheets['sheet1.xml'];
                    $('row c', sheet).each(function () {
                        var inputValue = $(this).closest('tr').find('input').val();
                        if (inputValue) {
                            $(this).text(inputValue);
                        }
                    });
                }
            }
        ],
        paging: false, ordering: false, searching: false, autoWidth: false, info: false,
        language: { emptyTable: "", zeroRecords: "", infoEmpty: "" }
    });
}
    */

// Function to initialize the DataTable with export options




// Initialize DataTable
function initializeDataTable() {
    if ($.fn.DataTable.isDataTable('#scheduleTable')) {
        $('#scheduleTable').DataTable().destroy();
    }

    $('#scheduleTable').DataTable({
        dom: 'Bfrtip',
        buttons: [
            {
                extend: 'excelHtml5',
                text: 'Export to Excel',
                className: 'buttons-excel',
                customize: function (xlsx) {
                    var sheet = xlsx.xl.worksheets['sheet1.xml'];
                    $('row c', sheet).each(function () {
                        var inputValue = $(this).closest('tr').find('input').val();
                        if (inputValue) {
                            $(this).text(inputValue);
                        }
                    });
                }
            }
        ],
        paging: false,
        ordering: false,
        searching: false,
        autoWidth: false,
        info: false,
        language: { emptyTable: "", zeroRecords: "", infoEmpty: "" }
    });
}

// Export Data Based on User Selection
function exportToExcel(option) {
    const table = document.querySelector('#scheduleTable');
    const table2excel = new Table2Excel();

    if (!selectedStore) {
        alert("Please select a store before exporting.");
        return;
    }

    if (option === 'newSheet') {
        table2excel.export(table, { filename: `Schedule_${selectedStore}.xlsx` });
        closeModal();
    } else if (option === 'existingSheet') {
        document.getElementById("excelFileInput").click(); // Open file picker
    }
}

// ✅ File Input Event - Only Triggered Once
document.getElementById("excelFileInput").addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (file) {
        console.log("File selected:", file.name); // Debugging
        appendToExistingExcel(file);
    }
});

async function appendToExistingExcel(file) {
    console.log("Appending data to:", file.name); // Debugging

    if (!selectedStore) {
        alert("Please select a store before adding to an existing sheet.");
        return;
    }

    const table = document.getElementById("scheduleTable");
    const reader = new FileReader();

    reader.readAsArrayBuffer(file);
    reader.onload = async function (e) {
        console.log("File successfully read."); // Debugging
        const data = new Uint8Array(e.target.result);
        let workbook = XLSX.read(data, { type: "array" });

        // Select first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert existing sheet data to JSON (array format)
        let sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        console.log("Existing Data Loaded:", sheetData); // Debugging

        // Ensure spacing: Add an empty row before appending new data
        if (sheetData.length > 0) {
            sheetData.push([]); // Blank row for spacing
        }

        // Append the selected store name before adding new rows
        sheetData.push([`Store: ${selectedStore}`]); // Add store label

        // Extract new table data (excluding headers)
        const newRows = [];
        let isFirstRow = true;
        for (let row of table.rows) {
            if (isFirstRow) {
                isFirstRow = false; // Skip headers
                continue;
            }
            const rowData = [];
            for (let cell of row.cells) {
                let cellText = cell.innerText.trim();
                
                // If cell contains an input field, get its value instead
                let inputElement = cell.querySelector("input");
                if (inputElement) {
                    cellText = inputElement.value.trim();
                }

                console.log("Extracted cell text:", cellText); // Debugging each cell
                rowData.push(cellText);
            }
            console.log("Extracted row data:", rowData); // Debugging each row
            newRows.push(rowData);
        }
        console.log("Final New Data to Append:", newRows); // Final check

        // Prevent empty data from being appended
        if (newRows.length === 0 || newRows.every(row => row.every(cell => cell === ""))) {
            alert("No new data found in the table.");
            return;
        }

        // Append new data after spacing row
        sheetData = [...sheetData, ...newRows];

        // Convert back to sheet
        const updatedSheet = XLSX.utils.aoa_to_sheet(sheetData);
        workbook.Sheets[sheetName] = updatedSheet;

        // Save the updated file
        console.log("Saving Updated File...");
        XLSX.writeFile(workbook, `Updated_Schedule_${selectedStore}.xlsx`);
        console.log("File Saved.");
    };
}

// Show Export Modal
document.getElementById("ExcelTransfer").addEventListener("click", function () {
    if (validateTable()) {
        document.getElementById("exportModal").style.display = "block";  // Show modal only
    } else {
        alert("Please fill all rows in the table before proceeding.");
    }
});

// Modal Button Actions
document.getElementById('createNewSheet').addEventListener('click', function () {
    exportToExcel('newSheet');
});

document.getElementById('addToExisting').addEventListener('click', function () {
    exportToExcel('existingSheet'); // ✅ Calls only exportToExcel() to trigger file selection
});

// Close Modal Function
function closeModal() {
    document.getElementById("exportModal").style.display = "none";
}

// Close Modal When Clicking Outside of It
window.onclick = function (event) {
    const modal = document.getElementById("exportModal");
    if (event.target === modal) {
        closeModal();
    }
};

document.getElementById("closeModal").addEventListener("click", closeModal);

// Initialize DataTable on Page Load
$(document).ready(function () {
    initializeDataTable();
});

