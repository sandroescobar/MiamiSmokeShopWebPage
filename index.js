
import express from "express";
import bodyParser from "body-parser";
import {dirname} from 'path';
import path from "path";
import {fileURLToPath} from 'url';



const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;




app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});



app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
