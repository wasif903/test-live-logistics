// const ErrorHandler = (err, req, res, next) => {
//     let statusCode = err.status || 500;
//     let message = err.message || 'Internal Server Error';

//     // Handle Mongoose CastError
//     if (err.name === 'CastError' && err.kind === 'ObjectId') {
//         statusCode = 400;
//         message = `Invalid ${err.path}: ${err.value}.`;
//     }

//     res.status(statusCode).json({
//         status: 'error',
//         statusCode,
//         message,
//         ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
//     });
// };

// export default ErrorHandler;

const ErrorHandler = (err, req, res, next) => {
  let statusCode = err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}.`;
  }

  // Handle Mongo duplicate key error
  // err.code 11000 is the duplicate key error code
  else if (err.code === 11000) {
    statusCode = 400; // Bad request, client sent duplicate data

    // Parse the duplicate key info from the error message or keyValue property
    // Mongo error sometimes has err.keyValue object with duplicate fields
    const duplicatedField = err.keyValue ? Object.keys(err.keyValue)[0] : null;
    const duplicatedValue = err.keyValue ? err.keyValue[duplicatedField] : null;

    if (duplicatedField && duplicatedValue) {
      message = `Duplicate value for field '${duplicatedField}': '${duplicatedValue}'. Please use a different value.`;
    } else {
      // fallback if keyValue is not available, parse from err.message string
      const matches = err.message.match(/index:\s+([a-zA-Z0-9_]+)_1 dup key: { :?"?([^ "}]+)"? }/);
      if (matches && matches.length === 3) {
        message = `Duplicate value for field '${matches[1]}': '${matches[2]}'. Please use a different value.`;
      } else {
        message = 'Duplicate key error.';
      }
    }
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default ErrorHandler;
