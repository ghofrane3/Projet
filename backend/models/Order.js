import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  products: Array,
  total: Number
});

export default mongoose.model("Order", orderSchema);
