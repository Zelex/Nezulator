function AIFFDecoder(decoderRef, isAIFC) {
	this.decoder = decoderRef;
	this.isAIFC = !!isAIFC;
	this.dataIsLittle = false;
	this.decodeHeader();
}
AIFFDecoder.prototype.validateHeaderData = function () {
	//Make sure we can handle the format specified:
	return (this.decoder.channels > 0 && this.decoder.channels < 3 && this.decoder.sampleRate > 0 && this.decoder.bitsPerSample > 0 && this.decoder.bitsPerSample < 65 && this.blockAlign == 0);
}
AIFFDecoder.prototype.decodeHeader = function () {
	//Cache the length:
	var length = this.decoder.binaryLength;
	//If you're gonna port this, then keep these ensureLength around to prevent buffer overflows!
	this.decoder.ensureLength(56 + this.decoder.headerOffset);
	//Grab some header variables:
	length = Math.min(this.decoder.dwordAt(4 + this.decoder.headerOffset) + this.decoder.headerOffset + 8, length);		//Restrict to at most the specified master length (Help avoid end trash).
	this.validateCOMMChunk();
	//Enforce some header variable acceptable ranges:
	if (this.validateHeaderData()) {
		//Flip the endian mode to little if we detected the "sowt" codec: 
		if (this.dataIsLittle) {
			this.decoder.littleEndian(true);	//Set to litte endian mode.
		}
		//The end position of our actual data:
		var endPosition = Math.min(this.endPosition, length);
		//Branch on codec type:
		switch (this.codec) {
			case 0:
				//PCM format:
				this.decoder.decodeSIGNED(this.startPosition, endPosition);
				break;
			case 1:
				//IEEE float 32 format:
				this.decoder.decodeFL32(this.startPosition, endPosition);
				break;
			case 2:
				//IEEE float 64 format:
				this.decoder.decodeFL64(this.startPosition, endPosition);
				break;
			case 3:
				//A-Law format:
				this.decoder.decodeALAW(this.startPosition, endPosition);
				break;
			case 4:
				//MU-Law format.
				this.decoder.decodeULAW(this.startPosition, endPosition);
				break;
			default:
				throw(new Error("AIFF data encoding type not supported."));
		}
	}
	else {
		throw(new Error("Music file header data invalid or corrupted."));
	}
}
AIFFDecoder.prototype.validateCOMMChunk = function () {
	//Position ourselves to the first 'magic' ID:
	var offsetCounter = 12 + this.decoder.headerOffset;
	//Check for the fmt ID:
	var chunkID = this.decoder.raw.substr(offsetCounter, 4);
	while (chunkID != "COMM") {
		//Position ourselves to the next cksize dword:
		offsetCounter += 4;
		//If you're gonna port this, then keep these ensureLength around to prevent buffer overflows!
		this.decoder.ensureLength(offsetCounter + 4);
		//Add the cksize to our current offset, and add four for the cksize's own size:
		offsetCounter += this.decoder.dwordAt(offsetCounter) + 4;
		//If you're gonna port this, then keep these ensureLength around to prevent buffer overflows!
		this.decoder.ensureLength(offsetCounter + 4);
		chunkID = this.decoder.raw.substr(offsetCounter, 4);
	}
	return this.validateSSNDChunk(this.decodeCOMMChunk(offsetCounter));
}
AIFFDecoder.prototype.decodeCOMMChunk = function (offsetCounter) {
	//Position to the COMM chunk cksize dword:
	offsetCounter += 4;
	//Make sure the cksize dword is there:
	this.decoder.ensureLength(offsetCounter + 22);
	this.decoder.channels = this.decoder.wordAt(4 + offsetCounter);
	this.decoder.bitsPerSample = this.decoder.wordAt(10 + offsetCounter);
	this.decoder.sampleRate = this.decodeSampleRate(12 + offsetCounter);
	if (this.isAIFC) {
		this.decoder.ensureLength(offsetCounter + 26);
		switch (this.decoder.raw.substr(offsetCounter + 22, 4)) {
			case "sowt":
				this.dataIsLittle = true;
			case "NONE":
				this.codec = 0;
				break;
			case "fl32":
			case "FL32":
				this.codec = 1;
				break;
			case "fl64":
			case "FL64":
				this.codec = 2;
				break;
			case "alaw":
			case "ALAW":
				this.codec = 3;
				break;
			case "ulaw":
			case "ULAW":
				this.codec = 4;
				break;
			default:
				throw(new Error("Unsupported AIFF compression type: " + this.decoder.raw.substr(offsetCounter + 22, 4)));
		}
	}
	else {
		this.codec = 0;
	}
	//Add the cksize to our current offset, and add four for the cksize's own size:
	offsetCounter += this.decoder.dwordAt(offsetCounter) + 4;
	return offsetCounter;
}
AIFFDecoder.prototype.decodeSampleRate = function (offset) {
	//80-bit float decoder for the sample rate:
	var exponent = this.decoder.wordAt(offset);
	var hiMantissa = this.decoder.dwordAt(offset + 2) >>> 0;
	var lowMantissa = this.decoder.dwordAt(offset + 6) >>> 0;
	if (exponent == 0 && hiMantissa == 0 && lowMantissa == 0) {
		return 0;
	}
	else {
		if (exponent == 0x7FFF) {
			var result = 1;
		}
		else {
			var result = hiMantissa * Math.pow(2, exponent - 16414);
			result += lowMantissa * Math.pow(2, exponent - 16446);
		}
		if (exponent > 0x7FFFF) {
			result *= -1;
		}
		return result;
	}
}
AIFFDecoder.prototype.validateSSNDChunk = function (offsetCounter) {
	//Look for the SSND ID:
	var chunkID = this.decoder.raw.substr(offsetCounter, 4);
	while (chunkID != "SSND") {
		//Position ourselves to the next cksize dword:
		offsetCounter += 4;
		//If you're gonna port this, then keep these ensureLength around to prevent buffer overflows!
		this.decoder.ensureLength(offsetCounter + 4);
		//Add the cksize to our current offset, and add four for the cksize's own size:
		offsetCounter += this.decoder.dwordAt(offsetCounter) + 4;
		//If you're gonna port this, then keep these ensureLength around to prevent buffer overflows!
		this.decoder.ensureLength(offsetCounter + 4);
		chunkID = this.decoder.raw.substr(offsetCounter, 4);
	}
	this.decodeSSNDChunk(offsetCounter);
}
AIFFDecoder.prototype.decodeSSNDChunk = function (offsetCounter) {
	//Position to the SSND chunk cksize dword:
	offsetCounter += 4;
	//Make sure the cksize dword is there:
	this.decoder.ensureLength(offsetCounter + 12);
	var startOffset = this.decoder.dwordAt(offsetCounter + 4);
	this.blockAlign = this.decoder.dwordAt(offsetCounter + 8);
	this.startPosition = offsetCounter + 12 + startOffset;
	this.endPosition = this.startPosition + this.decoder.dwordAt(offsetCounter);
}