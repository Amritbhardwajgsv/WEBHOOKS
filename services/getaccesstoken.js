async function getaccesstoken(){
    const url=`https://login.microsoftonline.com/${process.env.AZURE_TENANTID}/oauth2/v2.0/token`
    const body=new URLSearchParams({
        client_id:process.env.AZURE_CLIENTID,
        client_secret:process.env.AZURE_SECRET_KEY,
        scope: 'https://graph.microsoft.com/.default',
        grant_type:'client_credentials'
    });
    const res=await fetch(url,{method:'POST',body});
    if(!res.ok){
        throw new Error('Could not get access token');
    }
    const data=await res.json();
    return data.access_token;
}
module.exports=getaccesstoken;
