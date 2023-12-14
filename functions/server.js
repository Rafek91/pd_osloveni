const express = require('express')
const cors = require('cors')
const functions = require('firebase-functions')
const axios = require('axios')
const dotenv = require('dotenv').config()
const pdApiClient = require('./utils/pipedriveApiClient')
const pipedrive = require('pipedrive')
const jwt = require('jsonwebtoken');

const app = express()

app.use(cors())


const appUrl = process.env.APP_URL
const getPipedriveUserData = async(apiClient) => {
    try{
        const userApi = new pipedrive.UsersApi(apiClient)
        const userData = await userApi.getCurrentUser()
        return userData
    } catch(e) {
        console.log("error when calling Pipedrive/me",e)
    }
}

const createHookdeckWebHook = async(serverUrl,userId,companyId,companyUrl) => {
    const instanceName = companyUrl.match(RegExp("https%3A%2F%2F(.+?)\.pipedrive.com"))[1]
    try{
        const hookdeckApiUrl = 'https://api.hookdeck.com/2023-07-01/connections'
        const requestBody = {
            name: `DEV-user-${userId}_company-${companyId}`,
            source: {
                name:`DEV-${companyId}_${userId}_${instanceName}_osloveni`
            },
            destination: {
                name: `DEV-${companyId}_${userId}_osloveni`,
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
                        name: `${userId}_${companyId}`,
                        code: "addHandler('transform', (request, context) => {\n  const curName = request.body.current?.name || null\n  const prevName = request.body.previous?.name || null\n  console.log(curName, prevName)\n\n  if (curName !== prevName) {\n    return {\n      headers: {\n        'Content-Type': 'application/json'\n      },\n      body: {\n        requestValidation: 'valid',\n        firstName: request.body.current.first_name,\n        lastName: request.body.current.last_name\n      }\n    }\n  }\n\n  return {\n    headers: {\n      'Content-Type': 'application/json'\n    },\n    body: {\n      requestValidation: 'invalid'\n    }\n  }\n  // Transform the request object then return it.\n});"
                    }
                }
            ]
        }
        const hookdeckRequest = await axios.post(hookdeckApiUrl,requestBody,{
            headers: {
                'Authorization': `Bearer ${process.env.HOOKDECK_API_KEY}`,
                'content-type': 'application/json'
            }
        })
        return {
            'hookdeckWebhookUrl': hookdeckRequest.data.source.url,
            'hookdeckConnectionId': hookdeckRequest.data.id
        }
    } catch(e) {
        throw new Error('Error creating Hookdeck webhook',e);
    };
}

const createPipedriveOrganizationWebhook = async(hookdeckUrl,apiClient) => {
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

const checkSalutation = async (firstName,lastName) => {
    const sklovaniUrl = 'https://www.sklonovani-jmen.cz/api'
    const apiKey = process.env.SKLONOVANI_API_KEY
    try {
        const sklonovaniRequest = await axios.get(sklovaniUrl,{
            params:{
                klic:apiKey,
                pad:5,
                jmeno:`${firstName} ${lastName}`,
                'pouzit-krestni':'ano'
            }
        })
        const sklonovaniResponse = await sklonovaniRequest.data
        console.log(sklonovaniResponse)
        return sklonovaniResponse
    } catch (error) {
        console.error("error when fetching data from Sklonovani.cz",error)
    }
}

app.post('/testPd', async (req, res) => {
    console.log(req.body)
    const {firstName,lastName,person_id:personId,user_id:userId,company_id:companyId} = req.body

    const updatePipedriveField = async () => {
        try{
            const personApi = new pipedrive.PersonsApi(pdApiClient('v1:AQIBAHj+LzTNK2yuuuaLqifzhWb9crUNKTpk4FlQ9rjnXqp/6AG2kjYcnaOf62rtuKdznqAtAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMLyK+JBzc8G859V3BAgEQgDtqKqOkc+0lOEfcOs4gtQwH/dqrugrLSyItXcEDqK862cZlI4alVBNX/u+LuUyKW7sDHwEX8S3YQOBVIw==:/M4h+zmuL80fpON0UkQir/viLwKDch3ybTBJLvc0M0jE72LxCPY9gmL0UjOB9cu2+brntZ+8SyKXdMvV4vTd3OcQ6ZHReMRfnGsi3SWd+nfXOZlX8ND3iHkQfY1RZHL77Ln6kkib4rNzIbP1/FoueHXm+58ueuC23y/RwOqzBZXzhEfBB60ugNMF9ePsDALzCLWFn/DeZ/j0N2lpd0paTP1vpd0tsXesNB72ZiiE+0k3CVf3nlKKa0MXlU1iPjuUaRXRz7GVD7/CQMxiiUXHfVLAWhKfhIM=','10703868:3000557:ba5ad90890a46c389e37129d41ed0e26a652fd62'))
            const getSalutation = await checkSalutation(firstName,lastName)
            const opts = pipedrive.UpdatePerson.constructFromObject({
                'a06009f2d5291c0f9f754aabbf0464f893958fed': getSalutation
            })
            const upadatePerson = personApi.updatePerson(personId,opts)
        } catch(e) {
            console.log("error",e)
        }
    };

    updatePipedriveField();
})

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

        const redirectUrl = encodeURIComponent(exchangeToken.data.api_domain)
        res.redirect(`${appUrl}/welcome?redirectUrl=${redirectUrl}`)

        const currentUserData = await getPipedriveUserData(apiClient) // get PD/me data
        const { data: {id:pipedriveUserId,company_id:pipedriveCompanyId,name,email,company_name}} = currentUserData
        const hookdeckWebhook = await createHookdeckWebHook(serverUrl,pipedriveUserId,pipedriveCompanyId,redirectUrl) //předělat do jedné velké funkce, která poběží nezávisle na FE ?
/*         const saveUserCompanyInfoFirestore = await storeNewToken(name,email,company_name,pipedriveUserId,pipedriveCompanyId,hookdeckWebhook.hookdeckWebhookUrl,hookdeckWebhook.hookdeckConnectionId,exchangeToken.data.access_token,exchangeToken.data.refresh_token)
 */     const pipedriveWebhook = await createPipedriveOrganizationWebhook(hookdeckWebhook.hookdeckWebhookUrl,apiClient) //creat PD webhook

        console.log(pipedriveWebhook);

        const sendDataToMake = axios.post('https://hook.eu1.make.com/ume86jpbfh8sy8sflxawzqbe64xq511g',{
            pipedriveAppName:"Osloveni",
            pipedriveData:currentUserData
        });
    }catch(e) {
        console.log(e)
        return res.send('Unable to install the app')
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

exports.app = functions.https.onRequest(app)
