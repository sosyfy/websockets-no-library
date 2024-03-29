import { createServer } from 'http'
import crypto from "crypto"


const PORT = 3444; // Port number on which the server will listen
const WEB_SOCKETS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'; // Magic string used for WebSocket handshake
const SEVEN_BITS_INTEGER_MARKER = 125; // Marker for 7-bit payload length
const SIXTEEN_BITS_INTEGER_MARKER = 126; // Marker for 16-bit payload length
const SIXTY_FOUR_BITS_INTEGER_MARKER = 127; // Marker for 64-bit payload length
const MASK_KEY_INDICATOR_BYTES_LENGTH = 4; // Length of the mask key indicator in bytes
const FIRST_BIT = 128; // First bit value used in bitwise operations


// Creating the HTTP server

const server = createServer( ( request , response )=>{
   response.end("Hey there")
})

server.listen( 3006, function(){console.log( "server started")});


// Handling the upgrade event when a WebSocket connection is requested
server.on("upgrade" , onSocketUpgrade )

function onSocketUpgrade(req, socket , head ){
    // Retrieving the client's WebSocket key from the headers
    const { "sec-websocket-key" : webClientSocketKey } = req.headers;
     // Preparing the handshake headers using the WebSocket key
    const headers = prepareHandshakeHeaders(webClientSocketKey);
    
    socket.write(headers)
    socket.on("readable" , () => onSocketReadable(socket))
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
    }else if ( lengthIndicatorInBits === SEVEN_BITS_INTEGER_MARKER ){
        messageLength = socket.read(2).readUint16BE(0)
    }
    else {
        throw new Error("Your message is too long")
    }

    const maskKey = socket.read(MASK_KEY_INDICATOR_BYTES_LENGTH)

    const encodedBuffer = socket.read(messageLength)

    const decoded = unmask(encodedBuffer , maskKey )
    // Converting the decoded buffer to a string and sending a response back to the client

    const received = decoded.toString("utf8")

    const data = JSON.parse(received)

    sendMessage(socket , received)

}


 // Writing the message to the socket

function sendMessage(socket , data ){
     const message = prepareMessage(data)
     socket.write(message)
}

function prepareMessage(msgData){

    const msg = Buffer.from(msgData)
    const messageSize = msg.length 

    let dataFrameBuffer;
   

    const firstByte = 0x80 | 0x001 // 1 bit in binary 
    if (messageSize <= SEVEN_BITS_INTEGER_MARKER ){
        const bytes = [firstByte ]
        dataFrameBuffer = Buffer.from(bytes.concat(messageSize))

    } else if (messageSize <= 2**16 ) {
        const targetBytes = 4 
        const target = Buffer.allocUnsafe(targetBytes)

        target[0] = firstByte 
        target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0

        target.writeUint16BE(messageSize, 2 )
        dataFrameBuffer = target 
    }
    else {
        throw new Error("message too long")
    }

    const totalLength = dataFrameBuffer.byteLength + messageSize 
    const dataFramerResponse = concat([dataFrameBuffer , msg ], totalLength )

    return dataFramerResponse

}

function concat( bufferList , totalLength){
    const target = Buffer.allocUnsafe(totalLength)
    let offset = 0 
    for (const buffer of bufferList ){
       target.set(buffer , offset )
       offset += buffer.length
    }
    return target 
}

function unmask( encodedBuffer , maskKey ){
    //  code from docs
    // ^ means XOR 
    // returns 1 if both are different and 0 if they are the same 
    // i % 4 === 0,1,2,3 = index bits needed to decode the message 

    const finalBuffer = Buffer.from(encodedBuffer)
    
    for (let i = 0 ; i < encodedBuffer.length ; i++ ){
        finalBuffer[i] = encodedBuffer[i]^ maskKey[ i % 4 ]
    }

    return finalBuffer
}

// Preparing handshake headers
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

 // Generating the socket accept key by digesting the hash in base64 format
function createSocketAcceptKey(id){
    const shaun = crypto.createHash("sha1")
    shaun.update(id + WEB_SOCKETS_MAGIC_STRING )
    return shaun.digest("base64")
}


// error handling 
 const events = ["uncaughtException","unhandledRejection"]

events.forEach(event => {
    process.on( event , err => {
        console.error(`something bad happened event: ${event} , msg: ${err.stack}` );
    }) 
});

