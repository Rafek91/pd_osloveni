const express = require('express')
const cors = require('cors')
const functions = require('firebase-functions')
const axios = require('axios')
const dotenv = require('dotenv').config()
const pdApiClient = require('./utils/pipedriveApiClient')
const pipedrive = require('pipedrive')

const app = express()

app.use(cors())

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

app.get('/test', async (req, res) => {
    const sklovaniUrl = 'https://www.sklonovani-jmen.cz/api'
    const apiKey = process.env.SKLONOVANI_API_KEY
    try {
        const sklonovaniRequest = await axios.get(sklovaniUrl,{
            params:{
                klic:apiKey,
                pad:5,
                jmeno:'PetrSvetr'
            }
        })
        const sklonovaniResponse = await sklonovaniRequest.data
        console.log(sklonovaniResponse)

        res.send(sklonovaniResponse)
    } catch (error) {
        console.error("error when fetching data from Sklonovani.cz",error)
    }
})

app.get('/testPd', async (req, res) => {
    console.log(req.body)
    const {firstName,lastName,companyId,userId,organizationId} = req.body

    const updatePipedriveField = async () => {
        try{
            const userApi = new pipedrive.PersonsApi(pdApiClient)
            const customFieldId = '12345' // zjistit z firebase
            const salutationType = 'short' // zjistit z firebase, pokud je prázdné, použít "Dobrý den, pane Nováku"
            const getSalutation = await checkSalutation(firstName,lastName)

            console.log("get salutation",getSalutation)

/*             const userData = await userApi.getCurrentUser()
 */        } catch(e) {
            console.log("error when calling Pipedrive/me",e)
        }
    }

    updatePipedriveField()

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

exports.app = functions.https.onRequest(app)
