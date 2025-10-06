import nodemailer from 'nodemailer'

let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: 'skillstoretop01@gmail.com',
        pass: 'khoz tjsj yuvk nhqs'
    },
    tls: { rejectUnauthorized: false }
});


export default transporter;