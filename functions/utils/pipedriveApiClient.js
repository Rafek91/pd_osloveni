const pipedrive = require('pipedrive')
const dotenv = require('dotenv').config()

const pdApiClient = (aToken,rToken) => {
    const apiClient = new pipedrive.ApiClient();
    const oauth2 = apiClient.authentications.oauth2;
    oauth2.accessToken = aToken;
    oauth2.refreshToken = rToken;
    oauth2.clientId = process.env.PIPEDRIVE_CLIENT_ID
    oauth2.clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET

    return apiClient
}

module.exports = pdApiClient;