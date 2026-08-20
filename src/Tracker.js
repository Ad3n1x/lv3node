const mongoose = require("mongoose");

const EntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // Format: 'YYYY-MM-DD'
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const TrackerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        "habit",
        "counter",
        "timer",
        "goal",
        "expense",
        "mood",
        "task",
        "study",
        "bill",
      ],
      required: true,
    },
    color: { type: String, default: "#10b981" },
    icon: { type: String, default: "Circle" },
    target: { type: Number, default: null },
    unit: { type: String, default: "" },
    entries: [EntrySchema],
  },
  { timestamps: true }
);

// Transform _id to id in JSON output for frontend compatibility
TrackerSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    if (ret.entries && Array.isArray(ret.entries)) {
      ret.entries = ret.entries.map((e) => ({
        id: e._id || e.id,
        date: e.date,
        value: e.value,
      }));
    }
  },
});

module.exports = mongoose.model("Tracker", TrackerSchema);

const mongoose = require("mongoose");

const EntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const TrackerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["habit", "counter", "timer", "goal", "expense", "mood", "task", "study", "bill"],
      required: true,
    },
    icon: { type: String, default: "Star" },
    color: { type: String, default: "#3b82f6" },
    target: { type: Number, default: null },
    unit: { type: String, default: "" },
    entries: [EntrySchema],
  },
  { timestamps: true }
);

// Format _id to id in JSON output for frontend compatibility
TrackerSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model("Tracker", TrackerSchema);