(function(){
  const key='age_verified_21';
  const exitUrl='https://www.google.com';
  function isVerified(){
    try{
      return localStorage.getItem(key)==='true';
    }catch(_){
      return false;
    }
  }
  function setVerified(){
    try{
      localStorage.setItem(key,'true');
    }catch(_){
    }
  }
  function lock(){
    document.body.classList.add('age-gate-locked');
  }
  function unlock(){
    document.body.classList.remove('age-gate-locked');
  }
  function openGate(overlay){
    overlay.classList.add('is-visible');
    lock();
  }
  function closeGate(overlay){
    overlay.classList.remove('is-visible');
    unlock();
    overlay.remove();
  }
  function attach(){
    const overlay=document.getElementById('age-gate');
    if(!overlay) return;
    const accept=overlay.querySelector('[data-age-accept]');
    const exit=overlay.querySelector('[data-age-exit]');
    if(isVerified()){
      overlay.remove();
      unlock();
      return;
    }
    openGate(overlay);
    accept?.addEventListener('click',function(){
      setVerified();
      closeGate(overlay);
    });
    exit?.addEventListener('click',function(){
      window.location.href=exitUrl;
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',attach);
  }else{
    attach();
  }
})();
