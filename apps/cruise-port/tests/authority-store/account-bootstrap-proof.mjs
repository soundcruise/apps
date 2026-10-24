// Synthetic fixture observations ONLY. No real Account verification/authentication.
export function bootstrapFixtureProof(state){const tokens=new WeakMap();return Object.freeze({
    capture(input){if(!state.active||state.retired.includes(input.candidate.accountId))throw Error('fixture-candidate-retired');const token=Object.freeze({});tokens.set(token,{input:JSON.stringify(input),revision:state.revision});return token;},
    verify(token,input){const p=tokens.get(token);return !!p&&state.active&&!state.retired.includes(input.candidate.accountId)&&p.revision===state.revision&&p.input===JSON.stringify(input);}
});}
