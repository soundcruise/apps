// write callback confirms the complete JSON passed the stream, including pipe backpressure.
export async function writeJSONReport(report,stream=process.stdout){
 await new Promise((resolve,reject)=>stream.write(JSON.stringify(report,null,1)+'\n',error=>error?reject(error):resolve()));
}
