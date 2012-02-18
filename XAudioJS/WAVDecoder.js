function WAVDecoder(decoderRef) {
	this.decoder = decoderRef;
	this.decodeHeader();
}
WAVDecoder.prototype.validateHeaderData = function () {
	//Make sure we can handle the format specified:
	return (this.decoder.channels > 0 && this.decoder.channels < 3 && this.decoder.sampleRate > 0 && this.decoder.bitsPerSample > 0 && this.decoder.bitsPerSample < 65);
}
WAVDecoder.prototype.decodeHeader = function () {
	//Cache the length:
	var length = this.decoder.binaryLength;
	//If you're gonna port this, then keep these ensureLength around to prevent buffer overflows!
	this.decoder.ensureLength(44 + this.decoder.headerOffset);
	//Grab some header variables:
	length = Math.min(this.decoder.dwordAt(4 + this.decoder.headerOffset) + this.decoder.headerOffset + 8, length);		//Restrict to at most the specified master length (Help avoid end trash).
	this.decoder.channels = this.decoder.wordAt(22 + this.decoder.headerOffset);
	this.decoder.sampleRate = this.decoder.dwordAt(24 + this.decoder.headerOffset);
	this.decoder.bitsPerSample = this.decoder.wordAt(34 + this.decoder.headerOffset);
	//Enforce some header variable acceptable ranges:
	if (this.validateHeaderData()) {
		//Get the data start offset and the data length from the header:
		this.getHeaderOffsetSize();
		//If you're gonna port this, then keep these ensureLength around to prevent buffer overflows!
		this.decoder.ensureLength(this.startPosition);
		//The end position of our actual data:
		var endPosition = Math.min(this.startPosition + this.endPosition, length);
		//Branch on codec type:
		switch (this.decoder.wordAt(20 + this.decoder.headerOffset)) {
			case 1:
				//PCM format:
				this.decodeType1(this.startPosition, endPosition);
				break;
			case 3:
				//IEEE float format:
				this.decodeType3(this.startPosition, endPosition);
				break;
			case 6:
				//A-Law format:
				this.decoder.decodeALAW(this.startPosition, endPosition);
				break;
			case 7:
				//MU-Law format.
				this.decoder.decodeULAW(this.startPosition, endPosition);
				break;
			default:
				throw(new Error("WAV data encoding type not supported."));
		}
	}
	else {
		throw(new Error("Music file header data invalid or corrupted."));
	}
}
WAVDecoder.prototype.getHeaderOffsetSize = function () {
	//Position ourselves to the fmt ID:
	var offsetCounter = 12 + this.decoder.headerOffset;
	//Check for the fmt ID:
	var chunkID = this.decoder.raw.substr(offsetCounter, 4);
	if (chunkID == "fmt ") {
		while (chunkID != "data") {	//We can skip the fact (We can imply its contents) chunk enforcement, even though the spec requires it on some encodings.
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
		this.decodeDATAChunk(chunkID, offsetCounter);
	}
	else {
		throw(new Error("fmt chunk was missing from the header."));
	}
}
WAVDecoder.prototype.decodeDATAChunk = function (chunkID, offsetCounter) {
	if (chunkID == "data") {
		//Position to the data chunk cksize dword:
		offsetCounter += 4;
		//Make sure the cksize dword is there:
		this.decoder.ensureLength(offsetCounter + 4);
		//return the data length and the start position:
		this.startPosition = offsetCounter + 4;
		this.endPosition = this.decoder.dwordAt(offsetCounter);
	}
	else {
		throw(new Error("data chunk start could not be found."));
	}
}
WAVDecoder.prototype.decodeType1 = function (binaryIndex, length) {
	if (this.decoder.bitsPerSample > 8) {
		//Anything over 8-bit is signed:
		this.decoder.decodeSIGNED(binaryIndex, length);
	}
	else {
		//8-bit version is unsigned:
		this.decoder.decodeUNSIGNED(binaryIndex, length);
	}
}
WAVDecoder.prototype.decodeType3 = function (binaryIndex, length) {
	if (this.decoder.bitsPerSample == 32) {
		this.decoder.decodeFL32(binaryIndex, length);
	}
	else if (this.decoder.bitsPerSample == 64) {
		this.decoder.decodeFL64(binaryIndex, length);
	}
	else {
		throw(new Error("IEEE float " + this.decoder.bitsPerSample + " bits per sample is unsupported."));
	}
}