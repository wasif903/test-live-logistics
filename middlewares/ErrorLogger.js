import fs from 'fs';
import path from 'path';

const logDirectory = path.resolve('logs');

// Ensure logs directory exists
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

const errorLogStream = fs.createWriteStream(path.join(logDirectory, 'errors.log'), { flags: 'a' });

const errorLogger = (err, req, res, next) => {
    const log = `
[${new Date().toISOString()}]
${req.method} ${req.originalUrl}
Status: ${err.status || 500}
Message: ${err.message}
Stack: ${err.stack}

`;

    errorLogStream.write(log);
    next(err); // Forward to the next error handler
};

export default errorLogger;
