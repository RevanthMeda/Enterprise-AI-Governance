'use strict';

// Small loopback peer for the explicit-message subset used here. This is not a PLC
// simulator or a protocol conformance test. Run with NODE_PATH pointing at pinned
// st-ethernet-ip dependencies and FUXA_ROOT pointing at the checkout under test.
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const { once, EventEmitter } = require('node:events');
const library = require('st-ethernet-ip');
assert.equal(require('st-ethernet-ip/package.json').version, '2.7.5');

const session = 0x12345678;
const connection = 0x11223344;
const writes = [];
const lifecycle = [];
const sockets = new Set();
const peerErrors = [];
let responseStatus = 0;
let responseDelay = 0;
let acknowledgement;

function item(type, data) {
    const header = Buffer.alloc(4);
    header.writeUInt16LE(type);
    header.writeUInt16LE(data.length, 2);
    return Buffer.concat([header, data]);
}

function reply(socket, request, data) {
    const header = Buffer.from(request.subarray(0, 24));
    header.writeUInt16LE(data.length, 2);
    header.writeUInt32LE(session, 4);
    socket.write(Buffer.concat([header, data]));
}

function handle(socket, packet) {
    const command = packet.readUInt16LE();
    const body = packet.subarray(24);
    if (command === 0x65) {
        assert.deepEqual(body, Buffer.from([1, 0, 0, 0]));
        lifecycle.push('RegisterSession');
        reply(socket, packet, body);
        return;
    }
    assert.equal(packet.readUInt32LE(4), session);
    if (command === 0x66) { lifecycle.push('UnregisterSession'); return; }
    assert.ok(command === 0x6f || command === 0x70, 'supported encapsulation command');
    assert.equal(body.readUInt32LE(), 0);
    assert.equal(body.readUInt16LE(6), 2);
    let offset = 8;
    const items = [];
    for (let i = 0; i < 2; i++) {
        const type = body.readUInt16LE(offset);
        const length = body.readUInt16LE(offset + 2);
        offset += 4;
        assert.ok(offset + length <= body.length);
        items.push({ type, data: body.subarray(offset, offset + length) });
        offset += length;
    }
    assert.equal(offset, body.length);
    const connected = command === 0x70;
    assert.equal(items[0].type, connected ? 0xa1 : 0);
    assert.equal(items[1].type, connected ? 0xb1 : 0xb2);
    if (connected) assert.equal(items[0].data.readUInt32LE(), connection);
    const sequence = connected ? items[1].data.subarray(0, 2) : Buffer.alloc(0);
    const cip = items[1].data.subarray(sequence.length);
    const service = cip[0];
    const endOfPath = 2 + cip[1] * 2;
    assert.ok(endOfPath <= cip.length);
    let responseData = Buffer.alloc(0);
    let status = 0;
    let delay = 0;
    if (service === 0x54 || service === 0x4e) {
        assert.equal(connected, false);
        assert.equal(cip.subarray(2, endOfPath).toString('hex'), '20062401');
        lifecycle.push(service === 0x54 ? 'ForwardOpen' : 'ForwardClose');
        responseData = Buffer.alloc(service === 0x54 ? 26 : 10);
        responseData.writeUInt32LE(connection);
        if (service === 0x54) {
            responseData.writeUInt32LE(0x55667788, 4);
            // Echo connection serial, originator vendor and serial number.
            cip.copy(responseData, 8, endOfPath + 10, endOfPath + 18);
        }
    } else {
        assert.equal(service, 0x10, 'Set Attribute Single');
        assert.equal(connected, true);
        assert.equal(cip.subarray(2, endOfPath).toString('hex'), '200424643003');
        writes.push({ service, path: 'class=4 instance=100 attribute=3', hex: cip.subarray(endOfPath).toString('hex') });
        status = responseStatus;
        delay = responseDelay;
        responseStatus = 0;
        responseDelay = 0;
    }
    const response = Buffer.concat([sequence, Buffer.from([service | 0x80, 0, status, 0]), responseData]);
    const cpf = Buffer.concat([Buffer.alloc(6), Buffer.from([2, 0]), item(items[0].type, items[0].data), item(items[1].type, response)]);
    setTimeout(() => {
        if (!socket.destroyed) reply(socket, packet, cpf);
        if (acknowledgement) { acknowledgement(); acknowledgement = undefined; }
    }, delay);
}

const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', error => peerErrors.push(error.message));
    let pending = Buffer.alloc(0);
    socket.on('data', chunk => {
        pending = Buffer.concat([pending, chunk]);
        try {
            while (pending.length >= 24) {
                const size = 24 + pending.readUInt16LE(2);
                if (pending.length < size) return;
                handle(socket, pending.subarray(0, size));
                pending = pending.subarray(size);
            }
        } catch (error) { peerErrors.push(error.stack); socket.destroy(); }
    });
});

async function main() {
    const results = [];
    let device;
    const original = process.env.REVISION === 'original';
    const tag = { id: 'write', name: 'Command', address: 'Command', type: 'number',
        enipOptions: { tagType: 1, explicitOpt: { class: 4, instance: 100, attribute: 3 } } };
    const data = { id: 'plc', name: 'Loopback CIP peer', property: { address: '127.0.0.1' }, tags: { write: tag } };
    let scriptInput;
    let scriptOutput;
    const runtime = { logger: { error() {} }, scriptsMgr: { runScript: async script => {
        scriptInput = script.parameters[0].value;
        return scriptOutput === undefined ? scriptInput : scriptOutput;
    } } };
    const logger = { error() {}, debug() {}, info() {}, warn() {} };
    async function check(name, callback) {
        try { await callback(); results.push({ name, passed: true }); }
        catch (error) { results.push({ name, passed: false, error: error.message }); }
    }
    async function expectBytes(value, hex) {
        const count = writes.length;
        assert.equal(await device.setValue('write', value), true);
        assert.equal(writes.length, count + 1);
        assert.equal(writes.at(-1).hex, hex);
    }
    try {
        const listening = once(server, 'listening');
        server.listen(44818, '127.0.0.1');
        await listening;
        const driver = require(path.join(process.env.FUXA_ROOT, 'server/runtime/devices/genericethernetip'));
        device = driver.create(data, logger, new EventEmitter(), { require: () => library }, runtime);
        device.load(data);
        await device.connect();
        assert.deepEqual(lifecycle, ['RegisterSession', 'ForwardOpen']);
        for (const hex of ['0102', '1234', '0000']) await check('raw-' + hex, () => expectBytes(hex, hex));
        await check('skip-scalar-scale', async () => {
            tag.scale = { mode: 'linear', rawLow: 0, rawHigh: 100, scaledLow: 0, scaledHigh: 10 };
            device.load(data);
            await expectBytes('0102', '0102');
        });
        delete tag.scale;
        tag.scaleWriteFunction = 'encode';
        device.load(data);
        await check('identity-script-input', async () => { await expectBytes('0102', '0102'); assert.equal(scriptInput, '0102'); });
        scriptOutput = 'abcd';
        await check('transformed-script-output', () => expectBytes('0102', 'abcd'));
        delete tag.scaleWriteFunction;
        device.load(data);
        await check('mixed-case-whitespace', () => expectBytes('0a BC 00', '0abc00'));
        tag.enipOptions.explicitOpt.sendBuffer = '0102';
        device.load(data);
        await check('configured-send-buffer', () => expectBytes(undefined, '0102'));
        for (const value of ['123', 'gg', '0x0102', 102]) await check('reject-' + JSON.stringify(value), async () => {
            const count = writes.length;
            assert.equal(await device.setValue('write', value), false);
            assert.equal(writes.length, count);
        });
        await check('cip-error-response', async () => {
            const count = writes.length;
            responseStatus = 0x08; // Service not supported: nonzero general status.
            assert.equal(await device.setValue('write', 'abcd'), false);
            assert.equal(writes.length, count + 1);
        });
        await check('successful-write-after-error', () => expectBytes('abcd', 'abcd'));
        await check('wait-for-acknowledgement', async () => {
            responseDelay = 100;
            let settled = false;
            let sentAck = false;
            acknowledgement = () => { sentAck = true; };
            const pending = device.setValue('write', 'abcd').then(result => { settled = true; assert.equal(sentAck, true); return result; });
            await new Promise(resolve => setTimeout(resolve, 30));
            assert.equal(settled, false);
            assert.equal(await pending, true);
        });
        await check('disconnect-cleanup', async () => {
            await device.disconnect();
            device = undefined;
            await new Promise(resolve => setTimeout(resolve, 50));
            assert.equal(lifecycle.filter(x => x === 'ForwardClose').length, 1);
            assert.equal(sockets.size, 0);
        });
        assert.deepEqual(peerErrors, []);
        const failures = results.filter(result => !result.passed).map(result => result.name).sort();
        if (original) assert.deepEqual(failures, ['raw-0102', 'raw-1234', 'raw-0000', 'skip-scalar-scale', 'identity-script-input'].sort());
        else assert.deepEqual(failures, []);
    } finally {
        if (device) await device.disconnect().catch(() => {});
        for (const socket of sockets) socket.destroy();
        if (server.listening) await new Promise(resolve => server.close(resolve));
        const report = { revision: original ? 'original' : 'patched', library: 'st-ethernet-ip@2.7.5',
            results, lifecycle, writes, peerErrors, remainingSockets: sockets.size };
        console.log(JSON.stringify(report, null, 2));
        if (process.env.REPORT_PATH) fs.writeFileSync(process.env.REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
    }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
