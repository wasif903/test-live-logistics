import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  prefix: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export default mongoose.model('Counter', CounterSchema); 