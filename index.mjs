import { createServer } from 'http'
import crypto from "crypto"
const PORT = 3444
const WEB_SOCKETS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const SEVEN_BITS_INTEGER_MARKER = 125
const SIXTEEN_BITS_INTEGER_MARKER = 126
const SIXTY_FOUR_BITS_INTEGER_MARKER = 127

const MASK_KEY_INDICATOR_BYTES_LENGTH = 4

const FIRST_BIT = 128 //parseInt("1000000" ,2 )

const server = createServer( ( request , response )=>{
   response.end("Hey there")
})

server.listen( 3006, function(){console.log( "server started")});

server.on( "upgrade" , onSocketUpgrade )

function onSocketUpgrade(req, socket , head ){
    const { "sec-websocket-key" : webClientSocketKey } = req.headers;
    const headers = prepareHandshakeHeaders(webClientSocketKey);
    
    console.log(headers);
    socket.write(headers)
    socket.on( "readable" , () => onSocketReadable(socket))
}

function onSocketReadable(socket){
    // consume first byte 
    //  there are 8 bytes 
    // 1 - 1 byte === 8 bits 

    socket.read(1)
    const [ markerAndPayloadLength ]  = socket.read(1)
    // remove first bit  because first bit is always 1 for client - server messages 
    // this removes the masked bit 

    const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT 

    let messageLength = 0 
    if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
        messageLength = lengthIndicatorInBits 
    }else {
        throw new Error("Your message is too long")
    }

    const maskKey = socket.read(MASK_KEY_INDICATOR_BYTES_LENGTH)

    const encodedBuffer = socket.read(messageLength)

    const decoded = unmask(encodedBuffer , maskKey )

    const received = decoded.toString("utf8")

    const data = JSON.parse(received)

    console.log(data);
}

function unmask( encodedBuffer , maskKey ){

    const finalBuffer = Buffer.from(encodedBuffer)
    
    for (let i = 0 ; i < encodedBuffer.length ; i++ ){
        finalBuffer[i] = encodedBuffer[i]^ maskKey[ i % 4 ]
    }

    return finalBuffer
}

function prepareHandshakeHeaders(id){
   const acceptKey = createSocketAcceptKey(id)
   const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    ''
   ].map( line => line.concat('\r\n')).join('')

   return headers
}

function createSocketAcceptKey(id){
    const shaun = crypto.createHash("sha1")
    shaun.update(id + WEB_SOCKETS_MAGIC_STRING )
    return shaun.digest("base64")
}


// error handling 
 const events = ["uncaughtException","unhandledRejection"]

events.forEach(event => {
    process.on( event , err => {
        console.error(`something bad happened event: ${event} , msg: ${err}` );
    }) 
});

