import React, { useEffect,useState } from "react";
import Select from "react-select";
import { useLocation } from "react-router-dom";

const WelcomePage = () => {

    const location = useLocation()
    const searchParams = new URLSearchParams(location.search)
    const redirectUrl = searchParams.get('redirectUrl')

    const handleProceed = () => {
        window.open(redirectUrl)
    }

    return (
        <div className="welcome-page">
            <div className="welcome-container">
                <div className="text">
                    <h1>Instalace dokončena</h1>
                    <p>
                        Děkujeme za instalaci aplikace. Aplikace byla úspěšně nainstalována <br/>
                        Pro správné fungování aplikace je nutné nastavit, do kterého z pole budete zadávat nebo již zadávate IČO. Bez toho aplikace nedovede poznat doplnění nebo změnu IČA
                        a nebude správně fungovat.
                    </p>
                </div>  
                <div className="iframe-container">
                    <iframe
                    title="iframe" 
                    webkitallowfullscreen 
                    mozallowfullscreen 
                    allowfullscreen
                    src="https://www.loom.com/embed/f0a96969ed5a4a6788dad9b7c9a75d08?sid=ded81171-e465-4567-a2ea-403e6dce687c">
                    </iframe>
                </div>
                <button onClick={handleProceed}>Pokračovat do pipedrive</button>
            </div>
        </div>
    )
}

export default WelcomePage;