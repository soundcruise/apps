// Isolated entry point; deployment and IAM configuration are intentionally absent.
import http from 'node:http';
import {Firestore} from '@google-cloud/firestore';
import {createFirestoreReader} from './firestore-reader.mjs';
import {createCloudRunReadApi} from './cloudrun-api.mjs';
if(process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIRESTORE_EMULATOR_HOST)throw Error('unexpected_auth_override');
if(process.env.DOT_FIRESTORE_PROJECT!=='cruise-news-drive-isolation')throw Error('invalid_project');
let operators;try{operators=JSON.parse(process.env.NEWS_OPERATOR_EMAILS||'[]');}catch{throw Error('invalid_config');}
const db=new Firestore({projectId:process.env.DOT_FIRESTORE_PROJECT,preferRest:true});
const handler=createCloudRunReadApi({reader:createFirestoreReader(db),issuer:process.env.NEWS_ACCESS_ISSUER,audience:process.env.NEWS_ACCESS_AUD,operators});
const port=Number(process.env.PORT||8080);if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid_port');
http.createServer(async(req,res)=>{try{if((req.headers['content-length']&&req.headers['content-length']!=='0')||req.headers['transfer-encoding']){res.writeHead(400).end();return;}const response=await handler(new Request('http://localhost'+req.url,{method:req.method,headers:{'Cf-Access-Jwt-Assertion':req.headers['cf-access-jwt-assertion']||''}}));res.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(503).end();}}).listen(port,'0.0.0.0');
