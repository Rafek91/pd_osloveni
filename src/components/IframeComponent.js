import React, { useEffect,useState } from "react";
import Select from "react-select";
import { useLocation } from "react-router-dom";
import AppExtensionsSDK from '@pipedrive/app-extensions-sdk';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MessageModal from "./MessageModal";
import { MdEmail } from "react-icons/md";


function IframeComponent() {
  const serverURL = process.env.REACT_APP_SERVER_URL

  const referrer = document.referrer
  const regexPattern = '.pipedrive.com'
  const testDomain = new RegExp(regexPattern).test(referrer)

  const [customFieldsDropdown,setCustomFieldsDropdown] = useState([])
  const [SDK,setSDKinstance] = useState(null)
  const [dropdownAvailability,setDropdownAvailability] = useState(false)
  const [customFieldsdropdownValue,setCustomFieldsdropdownValue] = useState(null)
  const [isOpen,setIsOpen] = useState(false)
  const [salutationDropdownValue,setSalutationDropdownValue] = useState(null)

  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const reqId = searchParams.get('reqId');
  const companyId = searchParams.get('companyId');
  const userId = searchParams.get('userId');


  const salutationDropdownOption = [
    { value: "surnameName", label: "Dobrý den, pane Jane Nováku / Dobrý den, paní Adélo Nováková" },
    { value: "surname", label: "Dobrý den, pane Nováku / Dobrý den, paní Nováková" },
    { value: "name", label: "Dobrý den, Martine / Dobrý den, Jano" },
  ]

  const createDropdown = (items) => {
    const optionsStructure = items.data
    .filter(item => item.last_updated_by_user_id !== undefined && item.last_updated_by_user_id !== null && item.active_flag == true)
    .map((item) =>{
      return ({
        value: item.key,
        label: item.name
      })
    })
    return optionsStructure
  }

  const fetchOrgFields = async () => {
    try {
        const request = await fetch(`${serverURL}/organizationFields?userId=${userId}&companyId=${companyId}`)
        const responseData = await request.json()
        const output = await createDropdown(responseData)
        setCustomFieldsdropdownValue(output)
    } catch (e) {
        console.log(e)
    }
  }

  const initializeSDK = (reqId) => {
    const getCustomUISDK = async () => {
      try {
        console.log("Initializing SDK...");
        const SDK = await new AppExtensionsSDK({ identifier: `${reqId}` }).initialize();
        setSDKinstance(SDK)
      } catch (err) {
        console.error("Error initializing SDK:", err);
      }
    };
    getCustomUISDK();
  };

  useEffect(() => {
    fetchOrgFields()
    console.log("rerender")
  },[])
  
  useEffect(() => {
    if (reqId) {
      initializeSDK(reqId);
    }
  }, [reqId]);


  if(!testDomain) {

    const submitButton = async () => {
      try {
        if (customFieldsdropdownValue) {
          console.log(customFieldsdropdownValue, userId, companyId);
          setDropdownAvailability(true);
    
          const changeHookdeckFilter = await fetch(`${serverURL}/handlePipedriveRequest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pipedriveFiledKey: customFieldsdropdownValue.value,
              userId: userId,
              companyId: companyId,
            }),
          });
    
          if (changeHookdeckFilter.ok) {
            toast.success("Volba uložena"); 
          } else {
            toast.error("Chyba při ukládání volby");
          }
        } else {
          setDropdownAvailability(false);
        }
      } catch (error) {
        console.error('Error during fetch:', error);
        toast.error("Chyba při ukládání volby");
      }
    };



    const open = () => {
      setIsOpen(true)
    }

    const sendEmail = async (message) => {
      try {
        const generateToken = await fetch(`${serverURL}/sendEmail`,{
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            userId: userId,
            companyId: companyId,
          }),
        })

        const token = await generateToken.json()
        console.log(message,token)
      }catch(e) {
        console.log(e)
      }
    }


    return (
      <>
        <div>
          <MessageModal open={isOpen} close={()=>{setIsOpen(false)} } sendMessage={sendEmail}>
            Obsah zprávy
          </MessageModal>
      </div>
      <div>
        <div className="form-container">
            <h1>Nastavení</h1>
              <div className="text">
                <p>Zvolte prosím, které z vašich polí je určeno pro oslovení. Je nutné, aby toto pole mělo datový typ "Text". <br />Pokud pole ještě nemáte vytvořeno, tak jej prosím vytvořte a pak proveďte výběr.</p>
              </div>
                <div className="dropdown-container">
                  <Select
                  options={customFieldsDropdown}
                  className="dropdown"
                  placeholder="Vyberte pole oslovení"
                  isDisabled={dropdownAvailability}
                  value={customFieldsdropdownValue}
                  onChange={(item)=>{
                    setCustomFieldsdropdownValue(item)
                  }}
                  />
                  <Select
                  options={salutationDropdownOption}
                  className="dropdown"
                  placeholder="Vyberte preferovaný typ oslovení"
                  isDisabled={dropdownAvailability}
                  value={salutationDropdownValue}
                  onChange={(item)=>{
                    setSalutationDropdownValue(item)
                  }}
                  />
                </div>
                <button onClick={submitButton}>Potvrdit</button>
                <button className="button-sendEmail" onClick={open}>
                 E-mail&nbsp;<MdEmail />
                </button>
              <div>
          <ToastContainer
            position="bottom-center"
            autoClose={2000}
            hideProgressBar={true}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            draggable
            theme="dark"
          />
          </div>
        </div>
      </div>
      </>
    )
  }

  return (
    <div>
      <h1>
        Tuto stránku je možné načíst pouze z domény Pipedrive.com
      </h1>
    </div>
  )
}

export default IframeComponent;
