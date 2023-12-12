import React,{useState} from "react"
import ReactDOM from "react-dom"



const MessageModal = ({children,open,close,sendMessage}) => {

    const [message,setMessage] = useState('')
    const [messageBoxState,setMessageBoxState] = useState('editing')

    const handleNoteChange = (event) => {
        setMessage(event.target.value)
    };

    const handleSubmitMessage = () => {
        sendMessage(message)
        setMessageBoxState('submited')
    };

    const renderContent = () => {
        if(messageBoxState === 'editing') {
            return (
                <textarea 
                type="text" 
                name="message" 
                id="message"
                value={message} 
                onChange={handleNoteChange} 
                />    
            )
        } else {
            return(
                <>
                    <p>Děkujeme za zprávu</p>
                </>
            )
        }
    }

    const submitButtonVisibility = () => {
        if(messageBoxState === 'editing') {
            return (<button className="messageBox-submit" onClick={handleSubmitMessage}>Odeslat</button>)
        } else {
            return (
                <>
                </>
            )
        }
    }
    if(!open) return null

    return ReactDOM.createPortal(
        <>
            <div className="messageBox-shadow"/>
            <div className="messageBox-container">
                <div className="messageBox-content">
                    <button onClick={close}>x</button>
                    {renderContent()}
                </div>
                <div className="messageBox-footer">
                    {submitButtonVisibility()}
                </div>
            </div>
        </>,
        document.getElementById('modal-root')
    )
}

export default MessageModal