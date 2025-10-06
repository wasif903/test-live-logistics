export const HandleUpdateAgency = async (req, res, next, user) => {
    try {

        const {
            agencyName,
            username,
            status
        } = req.body

        user.agencyName = agencyName || user.agencyName
        user.username = username || user.username
        user.status = status || user.status

        await user.save();

        let details = {
            username: user.username,
            agencyName: user.agencyName,
            companyCode: user.companyCode,
            email: user.email,
            role: user.role,
            _id: user._id,
            createdAt: user.createdAt,
        };

        res.status(200).json({ message: "Profile Updated Successfully", user: details });

    } catch (error) {
        next(error)
    }
}


export const HandleUpdateOperator = async (req, res, next, user) => {
    try {

        const {
            username,
            phone,
            status
        } = req.body

        user.username = username || user.username
        user.phone = phone || user.phone
        user.status = status || user.status

        await user.save();

        let details = {
            username: user.username,
            email: user.email,
            phone: user.phone,
            role: user.role,
            agencyID: user.agencyID,
            officeID: user.officeID,
            status: user.status,
            _id: user._id,
            createdAt: user.createdAt,
        };

        res.status(200).json({ message: "Profile Updated Successfully", user: details });

    } catch (error) {
        next(error)
    }
}


export const HandleUpdateAdmin = async (req, res, next, user) => {
    try {

        const {
            username
        } = req.body

        user.username = username || user.username

        await user.save();

        let details = {
            username: user.username,
            email: user.email,
            role: user.role,
            _id: user._id,
            createdAt: user.createdAt,
        };

        res.status(200).json({ message: "Profile Updated Successfully", user: details });

    } catch (error) {
        next(error)
    }
}

export const HandleUpdateUser = async (req, res, next, user) => {
    try {

        const {
            username,
            country,
            countryCode,
            phone
        } = req.body

        user.username = username || user.username
        user.country = country || user.country
        user.countryCode = countryCode || user.countryCode
        user.phone = phone || user.phone

        await user.save();


        let details = {
            username: user.username,
            email: user.email,
            country: user.country,
            countryCode: user.countryCode,
            phone: user.phone,
            role: user.role,
            _id: user._id,
            createdAt: user.createdAt,
        };

        res.status(200).json({ message: "Profile Updated Successfully", user: details });

    } catch (error) {
        next(error)
    }
}