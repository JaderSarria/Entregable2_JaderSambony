import express from "express";
import handlebars from "express-handlebars";
import { __dirname } from "./util.js";
 
const app = express();
const port = 3000;

app.engine("handlebars", handlebars.engine());
app.set("views",__dirname+"/views");
app.set("view engine", "handlebars")


app.get('/', (req, res) => {
    const products=[
        {name_product: "Hamburger chimbisecchions", price: 10},
        {name_product: "Coke", price: 3},
        {name_product: "Pancake", price: 8}        
    ]
    res.render("index",{
    title:"Motores",
    username:"Muchachos",
    admin: true,
    product: products
  })
})

app.get('/contact', (req, res) => {
  res.render("contact",{
    title:"Motores/contacto",
    dato:"Por jugar"
  })
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})