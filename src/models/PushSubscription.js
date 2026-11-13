const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  subscription: { type: Object, required: true },
}, { timestamps: true });

module.exports = mongoose.models.PushSubscription || mongoose.model("PushSubscription", pushSubscriptionSchema);
