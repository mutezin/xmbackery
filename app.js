const express = require("express");
const app = express();
const db = require("./db");
//assign port to the server

app.listen(5000, () => console.log("server is running on port 5000"));

//endpoint
app.get("/", (req, res) => {
    db.query("SELECT * FROM products", (err, data) => {
        res.json(data);
    });
});

//allow express to parse request body

app.use(express.json());

app.post("/insert", (req,res)=>{
   // res.send(req.body);
   const {price, category, quantity}=req.body;
   const query = "Insert INTO products (price, category, quantity) VALUES (?,?,?)"
   db.query(query,[price,category,quantity],(error,result)=>{
    res.send(result)
   }) 
})