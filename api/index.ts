import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();

// Razorpay Lazy Initializer
let razorpayInstance: any = null;
const getRazorpay = () => {
  if (razorpayInstance) return razorpayInstance;
  
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error("Razorpay Key ID or Secret is not configured in environment variables.");
  }

  razorpayInstance = new Razorpay({
    key_id,
    key_secret,
  });
  return razorpayInstance;
};

app.use(cors());
app.use(bodyParser.json());

const router = express.Router();

// Health check
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    nodeEnv: process.env.NODE_ENV,
    razorpayConfigured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    timestamp: new Date().toISOString()
  });
});

// Webhook for Razorpay
router.post("/webhook/razorpay", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  if (!secret || !signature) {
    return res.status(400).send("No secret or signature");
  }

  try {
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (signature === expectedSignature) {
      res.json({ status: "ok" });
    } else {
      res.status(400).send("Invalid signature");
    }
  } catch (err) {
    res.status(500).send("Internal Server Error");
  }
});

// API Route: Get Config
router.get("/config", (req, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  });
});

// API Route: Create Order
router.post("/payment/order", async (req, res) => {
  const { amount, currency = "INR", receipt } = req.body;
  
  if (!amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Invalid amount provided" });
  }

  try {
    const razorpay = getRazorpay();
    const options = {
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receipt || `rec_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message || "Failed to create order",
      details: error.description || "Check gateway configuration"
    });
  }
});

// API Route: Verify Payment
router.post("/payment/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  console.log(`Verifying payment for Order: ${razorpay_order_id}, Payment: ${razorpay_payment_id}`);

  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!secret) {
      console.error("RAZORPAY_KEY_SECRET is not configured on server.");
      return res.status(500).json({ status: "error", message: "Razorpay Secret is not configured" });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSignature) {
      console.log("Payment signature verified successfully.");
      res.json({ status: "ok", message: "Payment verified successfully" });
    } else {
      console.error("Invalid signature detected for payment.");
      res.status(400).json({ status: "error", message: "Invalid signature" });
    }
  } catch (error: any) {
    console.error("Payment verification caught error:", error);
    res.status(500).json({ error: error.message || "Failed to verify payment" });
  }
});

// Mount the router on both '/api' and '/' to be safe on Vercel
app.use("/api", router);
app.use("/", router);

// Catch-all for API 404s to help debugging
app.use("/api/*", (req, res) => {
  res.status(404).json({ 
    error: "API Route Not Found", 
    path: req.originalUrl,
    method: req.method 
  });
});

export default app;
