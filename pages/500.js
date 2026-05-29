import React from 'react';

export default function Custom500() {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',padding:24}}>
      <h1 style={{fontSize:36,margin:0}}>500 — Server Error</h1>
      <p style={{marginTop:12,color:'#666'}}>Sorry, something went wrong on our end.</p>
    </div>
  );
}
