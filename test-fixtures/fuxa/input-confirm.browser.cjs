'use strict';

// Real browser events exercise the production input handlers and value validator.
// Angular services are replaced at their boundary; this is not a full HMI/PLC test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require('playwright');

const client = process.env.FUXA_CLIENT || path.resolve(__dirname, '../../../fuxa-input/client');
function compile(filename) {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename, reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
    });
    assert.equal(result.diagnostics.length, 0, `Transpile diagnostics: ${filename}`);
    return result.outputText;
}
const sources = {
    hmi: compile(path.join(client, 'src/app/_models/hmi.ts')),
    input: compile(path.join(client, 'src/app/gauges/controls/html-input/html-input.component.ts')),
    view: compile(process.env.FUXA_VIEW_SOURCE || path.join(client, 'src/app/fuxa-view/fuxa-view.component.ts'))
};

async function run() {
    const browser = await chromium.launch({ headless: true });
    let passed = 0;
    let failed = 0;
    try {
        const page = await browser.newPage();
        async function fixture(nodeName = 'input', numeric = false) {
            await page.setContent(`<${nodeName} id="first"></${nodeName}><input id="second"><button id="next">Next</button>`);
            await page.evaluate(({ sources, numeric }) => {
                const decorator = () => () => {};
                const angular = { Component: decorator, Input: decorator, Output: decorator, ViewChild: decorator, HostListener: decorator };
                function load(code, imports) {
                    const exports = {};
                    new Function('exports', 'require', code)(exports, name => imports[name] || {});
                    return exports;
                }
                const hmi = load(sources.hmi, { './device': { Tag: class {} } });
                class GaugeBaseComponent {
                    static getEvents(property) { return property.events || []; }
                }
                const input = load(sources.input, {
                    '@angular/core': angular,
                    '../../gauge-base/gauge-base.component': { GaugeBaseComponent },
                    '../../../_models/hmi': hmi,
                    '../../../_helpers/utils': { Utils: { isNullOrUndefined: value => value == null } }
                });
                const { FuxaViewComponent } = load(sources.view, {
                    '@angular/core': angular,
                    '../_models/hmi': hmi,
                    '../gauges/controls/html-input/html-input.component': input
                });
                FuxaViewComponent.getSvgElements = () => [];
                const view = Object.create(FuxaViewComponent.prototype);
                const state = window.state = { writes: [], scripts: [], warnings: [] };
                view.hmi = { layout: { inputdialog: 'false' } };
                view.gaugesManager = {
                    putEvent: event => state.writes.push({ id: event.dom.id, value: event.value }),
                    getBindSignalsValue: () => []
                };
                view.eventForScript = (_events, value) => state.scripts.push(value);
                view.setInputValidityMessage = (result, element) => {
                    state.warnings.push(result.errorText);
                    element.setCustomValidity(result.errorText);
                };
                for (const id of ['first', 'second']) {
                    const dom = document.getElementById(id);
                    dom.value = '10';
                    const options = { actionOnEsc: hmi.InputActionEscType.enter };
                    if (numeric && id === 'first') Object.assign(options, { numeric: true, min: 0, max: 100 });
                    view.onBindHtmlEvent({ type: 'key-enter', dom,
                        ga: { id, type: input.HtmlInputComponent.TypeTag, property: { options } } });
                }
            }, { sources, numeric });
        }
        async function state() { return page.evaluate(() => ({ ...window.state, active: document.activeElement.id })); }
        async function check(name, fn) {
            try { await fn(); console.log(`PASS: ${name}`); passed++; }
            catch (error) { console.error(`FAIL: ${name}: ${error.message}`); failed++; }
        }
        await check('Enter submits once and releases focus; another input remains editable', async () => {
            await fixture();
            await page.locator('#first').fill('42');
            await page.locator('#first').press('Enter');
            let result = await state();
            assert.deepEqual(result.writes, [{ id: 'first', value: '42' }]);
            assert.deepEqual(result.scripts, ['42']);
            assert.notEqual(result.active, 'first');
            await page.locator('#second').fill('77');
            assert.equal((await state()).active, 'second');
        });
        await check('ordinary click-away confirms once and moves focus', async () => {
            await fixture();
            await page.locator('#first').fill('23');
            await page.locator('#second').click();
            const result = await state();
            assert.deepEqual(result.writes, [{ id: 'first', value: '23' }]);
            assert.deepEqual(result.scripts, ['23']);
            assert.equal(result.active, 'second');
        });
        await check('later edits still confirm after an Enter submission', async () => {
            await fixture();
            await page.locator('#first').fill('10');
            await page.locator('#first').press('Enter');
            await page.locator('#first').fill('20');
            await page.locator('#next').click();
            assert.deepEqual((await state()).writes, [{ id: 'first', value: '10' }, { id: 'first', value: '20' }]);
        });
        await check('out-of-range Enter does not submit; corrected value can submit', async () => {
            await fixture('input', true);
            await page.locator('#first').fill('101');
            await page.locator('#first').press('Enter');
            let result = await state();
            assert.deepEqual(result.writes, []);
            assert.equal(result.active, 'first');
            assert.deepEqual(result.warnings, ['html-input.out-of-range']);
            await page.locator('#first').fill('50');
            await page.locator('#first').press('Enter');
            result = await state();
            assert.deepEqual(result.writes, [{ id: 'first', value: '50' }]);
        });
        await check('textarea Enter inserts a newline; Ctrl+Enter submits once', async () => {
            await fixture('textarea');
            await page.locator('#first').fill('first');
            await page.locator('#first').press('End');
            await page.locator('#first').press('Enter');
            assert.deepEqual((await state()).writes, []);
            assert.equal(await page.locator('#first').inputValue(), 'first\n');
            await page.locator('#first').press('Control+Enter');
            assert.deepEqual((await state()).writes, [{ id: 'first', value: 'first\n' }]);
        });
        await check('Tab confirms once and advances focus', async () => {
            await fixture();
            await page.locator('#first').fill('31');
            await page.locator('#first').press('Tab');
            const result = await state();
            assert.deepEqual(result.writes, [{ id: 'first', value: '31' }]);
            assert.equal(result.active, 'second');
        });
        console.log(`BROWSER REGRESSION: ${passed} passed, ${failed} failed`);
        if (failed) process.exitCode = 1;
    } finally {
        await browser.close();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
