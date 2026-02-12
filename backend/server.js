import express from "express";
import connectDB from "./config/db.js";

import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import orderRoutes from "./routes/order.routes.js";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());
// DB
connectDB();

// Routes
app.use("/api", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

// Test
app.get("/api/test", (req, res) => {
  res.send("API fonctionne");
});

app.listen(3000, () => {
  console.log("Serveur lancé sur http://localhost:3000");
});
