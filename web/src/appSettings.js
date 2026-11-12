const key='livetv:settings';
export function getAppSettings(){try{return {background:true,keepScreenOn:true,browserAlerts:false,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return {background:true,keepScreenOn:true,browserAlerts:false};}}
export function saveAppSettings(patch){const value={...getAppSettings(),...patch};localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event('livetv-settings'));return value;}
