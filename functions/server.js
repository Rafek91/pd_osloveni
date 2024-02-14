const express = require('express')
const cors = require('cors')
const functions = require('firebase-functions')
const axios = require('axios')
const dotenv = require('dotenv').config()
const pdApiClient = require('./utils/pipedriveApiClient')
const pipedrive = require('pipedrive')
const jwt = require('jsonwebtoken');
const db = require('./utils/firebaseAdmin')

const app = express()

app.use(cors())
const appUrl = process.env.APP_URL

const getPipedriveUserData = async (apiClient) => {
    try{
        const userApi = new pipedrive.UsersApi(apiClient)
        const userData = await userApi.getCurrentUser()
        return userData
    } catch(e) {
        console.log("error when calling Pipedrive/me",e)
    }
}

const createHookdeckWebHook = async (serverUrl,userId,companyId,companyUrl) => {
    const instanceName = companyUrl.match(RegExp("https%3A%2F%2F(.+?)\.pipedrive.com"))[1]
    console.log("input data:",serverUrl,userId,companyId,companyUrl)

    try{
        const hookdeckApiUrl = 'https://api.hookdeck.com/2023-07-01/connections'
        const requestBody = {
            name: `company-${companyId}`,
            source: {
                name:`${companyId}_${instanceName}_osloveni`
            },
            destination: {
                name: `${companyId}_osloveni`,
                url: `${serverUrl}/api/webhook/pipedriveWhUpdate`
            },
            rules: [
                {
                    type: "filter",
                    body: {
                        "requestValidation": {
                            "$neq": "invalid"
                        }
                    }
                },
                {
                    type: "transform",
                    transformation: {
                        name: `${companyId}`,
                        code: "addHandler(\'transform\', (request, context) => {\r\n    const data = request.body\r\n    const { name: currentName, first_name: firstName, last_name: lastName, id: personId } = request.body.current\r\n    const { user_id: userId, company_id: companyId } = request.body.meta\r\n    const { name: previousName } = request.body.previous ? request.body.previous : {\r\n        name: null\r\n    }\r\n\r\n    if (currentName !== previousName) {\r\n        const dataJson = {\r\n            \'headers\': {\r\n                \'Content-Type\': \'application\/json\'\r\n            },\r\n            \'body\': {\r\n                \'companyId\': companyId,\r\n                \'userId\': userId,\r\n                \'firstName\': firstName,\r\n                \'lastName\': lastName,\r\n                \'personId\': personId,\r\n                \'requestValidation\': \'valid\'\r\n            }\r\n        }\r\n        return dataJson\r\n    }\r\n\r\n    return {\r\n        \'headers\': {\r\n            \'Content-Type\': \'application\/json\'\r\n        },\r\n        \'body\': {\r\n            \'companyId\': companyId,\r\n            \'userId\': userId,\r\n            \'firstName\': firstName,\r\n            \'lastName\': lastName,\r\n            \'personId\': personId,\r\n            \'requestValidation\': \'invalid\'\r\n        }\r\n    }\r\n});"
                    }
                }
            ]
        }
        console.log("body",JSON.stringify(requestBody))
        const hookdeckRequest = await axios.post(hookdeckApiUrl,requestBody,{
            headers: {
                'Authorization': `Bearer ${process.env.HOOKDECK_API_KEY}`,
                'content-type': 'application/json'
            }
        })
        console.log('Response Status:', hookdeckRequest.status);
        console.log('Response Data:', hookdeckRequest.data);

        return {
            'hookdeckWebhookUrl': hookdeckRequest.data.source.url,
            'hookdeckConnectionId': hookdeckRequest.data.id
        }
    } catch (error) {
        if (error.response) {
            console.error('Error status:', error.response.status);
            console.error('Error data:', error.response.data);
            console.error('Error status text:', error.response.statusText);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error message:', error.message);
        }
        console.error('Error config:', error.config);
        return null
    };
}

const createPipedriveOrganizationWebhook = async (hookdeckUrl,apiClient) => {
    try{
        const api =  new pipedrive.WebhooksApi(apiClient);
        const webhookParameters =  pipedrive.AddWebhookRequest.constructFromObject({
            subscription_url: hookdeckUrl,
            event_action: '*',
            event_object: 'person'
        })
        const pipedriveRequest = await api.addWebhook(webhookParameters)
        return pipedriveRequest.data
    } catch(e) {
        console.log("error when creating Pipedrive/webhook",e)
    }
}

const checkSalutation = async (firstName,lastName,option) => {
    const sklovaniUrl = 'https://www.sklonovani-jmen.cz/api'
    const apiKey = process.env.SKLONOVANI_API_KEY

    const buildParamsObject = (option) => {
        switch(option){

            case 'surnameName':
            output = {
                klic:apiKey,
                pad:5,
                jmeno:`${firstName} ${lastName}`,
                'pouzit-krestni':'ano'
            }
            break;
        
            case 'surname':
            output = {
                klic:apiKey,
                pad:5,
                jmeno:`${lastName}`,
                'pouzit-krestni':'ne'
            }
            break;

            case 'null':
                output = {
                    klic:apiKey,
                    pad:5,
                    jmeno:`${lastName}`,
                    'pouzit-krestni':'ne'
                }
                break;
        
            case 'name':
            output = {
                klic:apiKey,
                pad:5,
                jmeno:`${firstName}`,
                'pouzit-krestni':'ne'
            }
            break;
        }

        return output
    }
    try {
        const sklonovaniRequest = await axios.get(sklovaniUrl,{
            params: buildParamsObject(option)
        })
        const sklonovaniResponse = await sklonovaniRequest.data
        console.log(sklonovaniResponse)
        return sklonovaniResponse
    } catch (error) {
        console.error("error when fetching data from Sklonovani.cz",error)
    }
}

const storeNewToken = async (name,email,companyName,pdUserId,pdCompanyId,hookdeckWhUrl,hookdeckWhId,accessToken,refreshToken) => {
    const documentRefCompanies =  db.collection('companies')
    const documentRefUsers =  db.collection('users')
    try {
        console.time("storeTokenBatch");

        // Create a batch
        const batch = db.batch();

        // Add writes to the batch
        const companyDocRef = documentRefCompanies.doc(`${pdCompanyId}`);
        batch.set(companyDocRef, {
            osloveni_field_id: '',
            company_users: [pdUserId],
            hookdeck_wh_url: hookdeckWhUrl,
            hookdeck_wh_id: hookdeckWhId,
            osloveni_settings: 'test',
            user_access_token: accessToken,
            user_refresh_token: refreshToken,
            hookdeck_wh_url: hookdeckWhUrl,
            hookdeck_wh_id: hookdeckWhId,
            user_name: name,
            user_email: email,
            user_company_name: companyName
        });

        // Commit the batch
        await batch.commit();

        console.timeEnd("storeTokenBatch");

        return { success: true };
    } catch (e) {
        console.log('error occurred when saving data to Firestore', e);
        return { success: false, error: e };
    }
};

const appUninstall = async (refreshToken,authHeader) => {
    try {
            const requestBody = {
                'token':refreshToken
            }
            const uninstallRequest = await axios.post('https://oauth.pipedrive.com/oauth/revoke',requestBody,{
                headers: { 
                    'Authorization': authHeader,
                    'content-type': 'application/x-www-form-urlencoded'
                }
            })
            console.log("uninstall request",uninstallRequest)
        } catch (error) {
        if (error.response) {
            console.error('Error status:', error.response.status);
            console.error('Error data:', error.response.data);
            console.error('Error status text:', error.response.statusText);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error message:', error.message);
        }
        console.error('Error config:', error.config);
        throw error;
    }
}

/* app.get('/testPd', async (req, res) => {
    const client_id = process.env.PIPEDRIVE_CLIENT_ID
    const client_secret = process.env.PIPEDRIVE_CLIENT_SECRET
    const authorizationHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`

    const rtoken = '3908256:12221862:e3415e90d4bb26c5cc8daa39f353fde400aa6704'
    const atoken = 'v1u:AQIBAHj-LzTNK2yuuuaLqifzhWb9crUNKTpk4FlQ9rjnXqp_6AG2kjYcnaOf62rtuKdznqAtAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMLyK-JBzc8G859V3BAgEQgDtqKqOkc-0lOEfcOs4gtQwH_dqrugrLSyItXcEDqK862cZlI4alVBNX_u-LuUyKW7sDHwEX8S3YQOBVIw:wNOxHRXQrhdvSLrP3RhTLSrfSFYrCFmZsP1LFsy1JyD-Fd_Oot4rmuRw5WrfMUVyxIjt28M8us18LWk7xFpBRZ7XZlltctHYNyMkGmoyZ-lHHt9KRtmtNKY4_70AZs7Tg3zOQX2l9UEgpXyd_nOzLE7RRbp86PL7UVh0FH-JkKq9IAOp9xZyBhrJFz1ThbqYCQSBlWJ_ynswIFBHIyTdqN0fNdldNKRm369Mbt3DavGM9IY-_qdDpNOPNYkE78PRs7o8XY9gYxvdX1eg2xEVy0anuXvwWEipxXHwA7IXhYyETbM'

    const appUninstall = async () => {
    try {
            const requestBody = {
                'token':rtoken
            }
            const uninstallRequest = await axios.post('https://oauth.pipedrive.com/oauth/revoke',requestBody,{
                headers: { 
                    'Authorization': authorizationHeader,
                    'content-type': 'application/x-www-form-urlencoded'
                }
            })
            console.log("uninstall request",uninstallRequest)
        } catch (error) {
        if (error.response) {
            console.error('Error status:', error.response.status);
            console.error('Error data:', error.response.data);
            console.error('Error status text:', error.response.statusText);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error message:', error.message);
        }
        console.error('Error config:', error.config);
        throw error;
    }
}
appUninstall()
}) */

app.get('/api/installation', async (req, res) => {
    const requestCode = req.query.code
    const client_id = process.env.PIPEDRIVE_CLIENT_ID
    const client_secret = process.env.PIPEDRIVE_CLIENT_SECRET
    const serverUrl = process.env.SERVER_URL
    const appUrl = process.env.APP_URL
    const authorizationHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`

    try{
        const postData = `grant_type=authorization_code&code=${encodeURIComponent(requestCode)}&redirect_uri=${encodeURIComponent(`${serverUrl}/api/installation`)}`;
        const exchangeToken = await axios.post('https://oauth.pipedrive.com/oauth/token',postData,{
            headers: { 
                'Authorization': authorizationHeader,
                'content-type': 'application/x-www-form-urlencoded'
            }
        })

        console.log("exchangeToken",JSON.stringify(exchangeToken.data))
        const accessToken = exchangeToken.data.access_token
        const refreshToken = exchangeToken.data.refresh_token
        const apiClient = pdApiClient(accessToken,refreshToken)
        const currentUserData = await getPipedriveUserData(apiClient)
        const { data: {id:pipedriveUserId,company_id:pipedriveCompanyId,name,email,company_name,access}} = currentUserData
        
        console.log("access",access)

        const accessValidation = access
        .filter( item => item.app === 'global')
        .map( item => item.admin === true ? 'valid' : 'invalid')
         
        if(accessValidation[0] === 'valid') {
            const redirectUrl = `${encodeURIComponent(exchangeToken.data.api_domain)}/settings/marketplace/app/93f56513e52ca2ba/app-settings`
            const hookdeckWebhook = await createHookdeckWebHook(serverUrl,pipedriveUserId,pipedriveCompanyId,redirectUrl)

            if (hookdeckWebhook === null) {
                // Handle the case where createHookdeckWebHook failed
                console.error('Hookdeck webhook creation failed');
                res.redirect(`${appUrl}/error`);
                appUninstall(refreshToken, authorizationHeader);
                return; // Stop further execution
            }

            res.redirect(`${appUrl}/welcome?redirectUrl=${redirectUrl}`)

            const saveUserCompanyInfoFirestore = await storeNewToken(name,email,company_name,pipedriveUserId,pipedriveCompanyId,hookdeckWebhook.hookdeckWebhookUrl,hookdeckWebhook.hookdeckConnectionId,exchangeToken.data.access_token,exchangeToken.data.refresh_token)
            const pipedriveWebhook = await createPipedriveOrganizationWebhook(hookdeckWebhook.hookdeckWebhookUrl,apiClient) //creat PD webhook
    
            console.log(pipedriveWebhook,saveUserCompanyInfoFirestore);
    
            const sendDataToMake = axios.post('https://hook.eu1.make.com/ume86jpbfh8sy8sflxawzqbe64xq511g',{
                pipedriveAppName:"Osloveni",
                pipedriveData:currentUserData
            });
        } else {
            res.redirect(`${appUrl}/error`)
            appUninstall(refreshToken,authorizationHeader)
        }
    }
    catch(e) {
        console.log(e)
        appUninstall(refreshToken,authorizationHeader)
        res.send('Aplikace je na vaší instanci již nainstalována')
    };
});

app.get('/api/openSettings', async (req, res) => {
    const reqId = req.query.id
    const companyId = req.query.companyId
    const userId = req.query.userId
    try {
        const verifyToken = jwt.verify(req.query.token, process.env.PIPEDRIVE_CLIENT_SECRET);
        res.redirect(`${appUrl}/?reqId=${reqId}&companyId=${companyId}&userId=${userId}`);
    } catch (error) {
        console.error('JWT verification failed:', error);
        res.status(403).send('JWT token is invalid or expired');
    }
});

app.get('/api/personFields',  async (req, res) => {
    const {userId,companyId} = req.query
    const loadCompanyFromFirestore = async (companyId) => {
        try{
            const getCompany = await db.collection('companies').doc(`${companyId}`).get()
            const companyData = getCompany.data()
            if(companyData) {
                console.log("data",companyData)
                return companyData
            }
            console.log("nodata",companyData)
            await new Promise(resolve => setTimeout(resolve,5000));
            return await loadCompanyFromFirestore(companyId);
        } catch(e) {
           console.log("error when loading person fields from Pipedrive",e)
           throw new Error('Error loading person fields from Pipedrive',)
       }
    }

    const firebaseCompanyData = await loadCompanyFromFirestore(companyId)
    const accessToken = firebaseCompanyData.user_access_token
    const refreshToken = firebaseCompanyData.user_refresh_token

    const apiClient = pdApiClient(accessToken,refreshToken)
    const api = new pipedrive.PersonFieldsApi(apiClient)
    const personFields = await api.getPersonFields()

    res.send(personFields).status(200)
});

app.post('/api/updateSettings', async (req, res) => {
    console.log(req.body)
    const companyId = req.body.companyId
    const pipedriveOsloveniFieldKey = req.body.pipedriveFiledKey
    const osloveniSettings = req.body.fieldSetting
    const userId = req.body.userId

    const updateFirestoreIcoField = async (osloveniFieldKey,pdCompanyId) => {
        const documentRefCompanies = db.collection('companies')
        try{
            await documentRefCompanies.doc(`${pdCompanyId}`).update({
                osloveni_field_id:`${osloveniFieldKey}`,
                osloveni_settings:`${osloveniSettings}`
            });
            res.sendStatus(200);
        }catch(e){
            console.log(e)
            res.sendStatus(500)
        }
    };

    updateFirestoreIcoField(pipedriveOsloveniFieldKey,companyId)
})


app.post('/api/webhook/pipedriveWhUpdate', async (req, res) => {
    const {firstName,lastName,personId,userId,companyId} = req.body

    console.log("userId:", userId);
    console.log("companyId:", companyId);
    
    console.log("post user_id",userId)


    const loadOrgFromFirestore = async (companyId) => {
        try {
            const getCompany = await db.collection('companies').doc(`${companyId}`).get()
            const companyData = getCompany.data()
            console.log("company data",companyData)
            return companyData
        } catch (error) {
            throw new Error(error)
        }
    }
    
    const firebaseCompanyData = await loadOrgFromFirestore(companyId)

    const {osloveni_field_id,osloveni_settings,user_access_token:userAccessToken,user_refresh_token:userRefreshToken} = firebaseCompanyData
   
    const updatePipedriveField = async () => {
            try{
                const personApi = new pipedrive.PersonsApi(pdApiClient(userAccessToken,userRefreshToken))
                const getSalutation = await checkSalutation(firstName,lastName,osloveni_settings)
                console.log("salut",getSalutation)
                const opts = pipedrive.UpdatePerson.constructFromObject({
                    [`${osloveni_field_id}`] : getSalutation
                })
                const upadatePerson = await personApi.updatePerson(personId,opts)
                res.sendStatus(200)
            } catch(e) {
                console.log("error",e)
                res.sendStatus(500)
            }
    }

    updatePipedriveField();

});

app.delete('/api/installation',async (req, res) => {
    console.log("deleted app",req.body)

    const {user_id:userId,company_id:companyId} = req.body
    
    const loadCompanyFirestore = async () => {
        console.time('load firebase user')
        try{
            const getCompany = await db.collection('companies').doc(`${companyId}`).get()
            const companyData = getCompany.data()
            console.log("load company from firestore", companyData)
            console.timeEnd('load firebase user')
            return companyData
        } catch(e) {
            console.log('error when loading user from firestore',e)
       }
    }

    try{
        const firestoreCompanyData = await loadCompanyFirestore()
        const hookdeckConnectionId = firestoreCompanyData.hookdeck_wh_id
        
        const hookdeckRequest = async () => {
            const loadHookdeckWebhooks = await axios.delete(`https://api.hookdeck.com/2023-07-01/connections/${hookdeckConnectionId}`,{
            headers: {
                'Authorization': `Bearer ${process.env.HOOKDECK_API_KEY}`,
                'content-type': 'application/json'
            }
        })
        const hookdeckResponse = loadHookdeckWebhooks.data
        console.log("hookdeck deleted connections",hookdeckResponse)
        } 

        await hookdeckRequest()
    } catch (error) {
        if (error.response) {
            console.error('Error status:', error.response.status);
            console.error('Error data:', error.response.data);
            console.error('Error status text:', error.response.statusText);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error message:', error.message);
        }
        console.error('Error config:', error.config);
        throw error;
    }
})

exports.app = functions.https.onRequest(app)
