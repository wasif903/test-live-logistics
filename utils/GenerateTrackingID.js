// utils/generateTrackingID.js
import ParcelModel from '../models/ParcelSchema.js';
import Counter from '../models/CounterSchema.js';

export const GenerateTrackingID = async (agencyCode, destinationCountry, session = null) => {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const formattedDate = `${year}${month}${day}`;

    const baseTrackingPrefix = `${agencyCode}-${destinationCountry}-${formattedDate}`;

    // Atomically increment the sequence for this prefix
    const counter = await Counter.findOneAndUpdate(
        { prefix: baseTrackingPrefix },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session }
    );

    const paddedSequence = String(counter.seq).padStart(3, '0');
    return `${baseTrackingPrefix}-${paddedSequence}`;
};
