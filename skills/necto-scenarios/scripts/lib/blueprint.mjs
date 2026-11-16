// Necto.UI/src/features/workbench/body.js
var isJson = (type) => /(?:\/|\+)json(?:;|$)/i.test(type);
function bodyContent(operation, draft = {}) {
	const entries = Object.entries(operation.requestBody?.content ?? {});
	return entries.find(([type]) => type === draft.mediaType) ?? entries.find(([type]) => isJson(type)) ?? entries[0];
}
function payloadSnapshot(draft) {
	return {
		...draft.bodyVariants ? { bodyVariants: { ...draft.bodyVariants } } : {},
		mediaType: draft.mediaType,
		extraHeaders: draft.extraHeaders ? { ...draft.extraHeaders } : void 0,
		extraQuery: draft.extraQuery?.map((row) => [...row]),
		binaryAttachmentRequired: Boolean(draft.binaryFile || draft.binaryAttachmentRequired),
		formFields: draft.formFields?.map(({ files, ...row }) => ({
			...row,
			files: [],
			attachmentRequired: Boolean(files?.length || row.attachmentRequired)
		}))
	};
}
function validatePayloadSnapshot(snapshot) {
	if (snapshot.bodyVariants !== void 0 && (!snapshot.bodyVariants || Array.isArray(snapshot.bodyVariants) || typeof snapshot.bodyVariants !== "object" || Object.keys(snapshot.bodyVariants).length > 1e3 || Object.entries(snapshot.bodyVariants).some(([key, index]) => key !== "" && !key.startsWith("/") || key.length > 2048 || !Number.isInteger(index) || index < 0 || index > 1e3))) throw new Error("Invalid body schema variants.");
	if (snapshot.extraHeaders !== void 0 && (!snapshot.extraHeaders || Array.isArray(snapshot.extraHeaders) || typeof snapshot.extraHeaders !== "object" || Object.keys(snapshot.extraHeaders).length > 100 || Object.values(snapshot.extraHeaders).some((value) => typeof value !== "string"))) throw new Error("Invalid imported headers.");
	if (snapshot.extraQuery !== void 0 && (!Array.isArray(snapshot.extraQuery) || snapshot.extraQuery.length > 200 || snapshot.extraQuery.some((row) => !Array.isArray(row) || row.length !== 2 || row.some((value) => typeof value !== "string")))) throw new Error("Invalid imported query inputs.");
	if (snapshot.mediaType !== void 0 && typeof snapshot.mediaType !== "string") throw new Error("Invalid body media type.");
	if (snapshot.formFields !== void 0 && (!Array.isArray(snapshot.formFields) || snapshot.formFields.length > 200 || snapshot.formFields.some((row) => typeof row.name !== "string" || typeof row.value !== "string" || !["file", "text"].includes(row.kind) || typeof row.enabled !== "boolean"))) throw new Error("Invalid saved form fields.");
}
// Necto.UI/src/features/workbench/executionOptions.js
var DEFAULT_TIMEOUT = 3e4;
function executionOptions(draft = {}) {
	const timeout = draft.timeout === void 0 ? DEFAULT_TIMEOUT : draft.timeout;
	const responseLimitMiB = draft.responseLimitMiB === void 0 ? 32 : draft.responseLimitMiB;
	if (!Number.isInteger(timeout) || timeout < 1 || timeout > 6e5) throw new Error("Timeout must be a whole number from 1 to 600000 ms.");
	if (!Number.isInteger(responseLimitMiB) || responseLimitMiB < 1 || responseLimitMiB > 512) throw new Error("Response budget must be a whole number from 1 to 512 MiB.");
	return {
		timeout,
		responseLimitMiB
	};
}
// Necto.UI/src/features/workbench/assertions.js
var assertionKinds = {
	status: "HTTP status",
	exists: "Field exists",
	equals: "Field equals",
	nonempty: "Not empty",
	duration: "Response time below (ms)"
};
function pointerPath(pointer = "") {
	if (!pointer) return [];
	if (!pointer.startsWith("/") || /~(?![01])/u.test(pointer)) throw new Error("Use a JSON Pointer, for example /lines/0/id.");
	return pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}
function validateAssertions(checks = []) {
	if (!Array.isArray(checks) || checks.length > 50) throw new Error("A request supports at most 50 checks.");
	for (const check of checks) {
		if (!Object.hasOwn(assertionKinds, check.kind) || typeof (check.path ?? "") !== "string") throw new Error("Invalid request check.");
		pointerPath(check.path);
		if (["status", "duration"].includes(check.kind) && (!Number.isFinite(Number(check.expected)) || Number(check.expected) < 0)) throw new Error("Enter a valid numeric expectation.");
		if (check.kind === "equals") try {
			JSON.parse(check.expected);
		} catch {
			throw new Error("The expected value must be JSON, for example 42 or \"PLN\".");
		}
	}
}
var known = new Set([
	["uuid", "UUID"],
	["firstName", "Person · first name"],
	["lastName", "Person · last name"],
	["fullName", "Person · full name"],
	["email", "Internet · email"],
	["username", "Internet · username"],
	["company", "Company · name"],
	["city", "Location · city"],
	["countryCode", "Location · country code"],
	["integer", "Number · integer (0–1000)"],
	["boolean", "Boolean"],
	["date", "Date · ISO timestamp"],
	["regex", "Pattern · bounded regex"]
].map(([key]) => key));
function patternTokens(pattern) {
	if (typeof pattern !== "string" || !pattern || pattern.length > 256) throw new Error("Enter a pattern of 1–256 characters.");
	let text = pattern;
	if (text.startsWith("^")) text = text.slice(1);
	if (text.endsWith("$") && !text.endsWith("\\$")) text = text.slice(0, -1);
	const tokens = [], digits = "0123456789", words = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
	let index = 0, maxLength = 0;
	const escaped = () => {
		if (index >= text.length) throw new Error("Incomplete pattern escape.");
		const char = text[index++];
		if (char === "d") return digits;
		if (char === "w") return words;
		if (char === "s") return " ";
		if ("\\.^$[]{}()*+?|-/".includes(char)) return char;
		throw new Error("Supported escapes: \\d, \\w, \\s or escaped punctuation.");
	};
	while (index < text.length) {
		let choices, char = text[index++];
		if (char === "\\") choices = escaped();
		else if (char === "[") {
			choices = "";
			while (index < text.length && text[index] !== "]") {
				let first = text[index++];
				if (first === "^" || first === "[") throw new Error("Negated or nested classes are not supported.");
				if (first === "\\") {
					choices += escaped();
					continue;
				}
				if (text[index] === "-" && text[index + 1] && text[index + 1] !== "]") {
					index++;
					const last = text[index++];
					if (first.charCodeAt(0) > last.charCodeAt(0) || last.charCodeAt(0) > 126 || first.charCodeAt(0) < 32) throw new Error("Use ascending printable character ranges.");
					for (let code = first.charCodeAt(0); code <= last.charCodeAt(0); code++) choices += String.fromCharCode(code);
				} else choices += first;
			}
			if (text[index++] !== "]" || !choices) throw new Error("Close each non-empty character class with ].");
		} else {
			if (".^$]{}()*+?|".includes(char)) throw new Error("Use literals, [A-Z], \\d, \\w and {n} or {min,max}. Unbounded repetition and groups are not supported.");
			choices = char;
		}
		let min = 1, max = 1;
		if (text[index] === "?") {
			min = 0;
			index++;
		} else if (text[index] === "{") {
			const end = text.indexOf("}", index), count = text.slice(index + 1, end);
			if (end < 0 || !/^\d{1,2}(,\d{1,2})?$/.test(count)) throw new Error("Use a bounded count such as {4} or {2,8}.");
			const parts = count.split(",").map(Number);
			min = parts[0];
			max = parts[1] ?? min;
			index = end + 1;
			if (min > max || max > 32) throw new Error("Pattern counts must be ordered and at most 32.");
		}
		maxLength += max;
		if (maxLength > 256) throw new Error("Generated patterns are limited to 256 characters.");
		tokens.push({
			choices,
			min,
			max
		});
	}
	if (!tokens.length) throw new Error("Pattern needs at least one character token.");
	return tokens;
}
function validateGenerator(input) {
	if (!known.has(input.generator)) throw new Error("Choose a supported data generator.");
	if (input.generator === "regex") patternTokens(input.pattern);
}
// Necto.UI/src/features/scenario-builder/pointers.js
var forbidden = /* @__PURE__ */ new Set([
	"__proto__",
	"prototype",
	"constructor"
]);
function pointerParts(pointer) {
	if (typeof pointer !== "string" || pointer.length > 2048 || pointer !== "" && !pointer.startsWith("/")) throw new Error("Use a JSON Pointer such as /items/0/id. Leave empty for the whole value.");
	const parts = pointer === "" ? [] : pointer.slice(1).split("/").map((part) => {
		if (/~(?:[^01]|$)/.test(part)) throw new Error("Escape ~ as ~0 and / as ~1 in JSON Pointers.");
		return part.replaceAll("~1", "/").replaceAll("~0", "~");
	});
	if (parts.length > 32 || parts.some((part) => forbidden.has(part))) throw new Error("This JSON Pointer is not supported.");
	return parts;
}
function readPointer(value, pointer) {
	for (const part of pointerParts(pointer)) {
		if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) throw new Error(`Response has no value at ${pointer || "(root)"}.`);
		value = value[part];
	}
	if (value === void 0) throw new Error("Response has no JSON value.");
	return value;
}
// Necto.UI/src/features/scenario-builder/waiting.js
function expectedValue(condition) {
	if (typeof condition.value !== "string" || condition.value.length > 16384) throw new Error("Expected values are limited to 16 KiB.");
	if (condition.valueType === "text") return condition.value;
	if (![
		"number",
		"boolean",
		"json"
	].includes(condition.valueType)) throw new Error("Choose an expected value type.");
	let value;
	try {
		value = JSON.parse(condition.value);
	} catch {
		throw new Error("Enter a valid expected value for the selected type.");
	}
	if (condition.valueType === "number" && (typeof value !== "number" || !Number.isFinite(value)) || condition.valueType === "boolean" && typeof value !== "boolean") throw new Error("Expected value does not match the selected type.");
	const pending = [{
		value,
		depth: 0
	}];
	let visited = 0;
	while (pending.length) {
		const item = pending.pop();
		if (typeof item.value === "number" && !Number.isFinite(item.value)) throw new Error("Expected JSON numbers must be finite.");
		if (++visited > 4096 || item.depth > 32) throw new Error("Expected JSON is too large or too deeply nested.");
		if (item.value && typeof item.value === "object") for (const value of Object.values(item.value)) pending.push({
			value,
			depth: item.depth + 1
		});
	}
	return value;
}
function validateWaiting(step) {
	if (step.delayMs !== void 0 && (!Number.isInteger(step.delayMs) || step.delayMs < 0 || step.delayMs > 6e5)) throw new Error("Delay must be a whole number from 0 to 600000 ms.");
	if (step.waitFor !== void 0) {
		const condition = step.waitFor;
		if (!condition || typeof condition !== "object" || Array.isArray(condition)) throw new Error("Invalid response wait condition.");
		pointerParts(condition.pointer);
		expectedValue(condition);
		if (!Number.isInteger(condition.retryCount) || condition.retryCount < 0 || condition.retryCount > 100) throw new Error("Retry count must be a whole number from 0 to 100 (after the first request).");
		if (!Number.isInteger(condition.intervalMs) || condition.intervalMs < 100 || condition.intervalMs > 6e5) throw new Error("Retry interval must be a whole number from 100 to 600000 ms.");
	}
}
// Necto.UI/src/features/scenario-builder/variables.js
var variableProducer = (input, blueprint) => input.source === "response" ? input.stepId : input.source === "variable" ? blueprint.variables?.find((variable) => variable.id === input.variableId && variable.source === "response")?.stepId : void 0;
var staticVariableValue = (variable) => expectedValue(variable);
function validateVariables(blueprint) {
	const variables = blueprint.variables ?? [];
	if (!Array.isArray(variables) || variables.length > 100 || blueprint.version < 4 && variables.length) throw new Error("Shared variables require version 4 (maximum 100).");
	const ids = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Set(), stepIds = new Set(blueprint.steps.map((step) => step.id));
	for (const variable of variables) {
		if (!variable || typeof variable.id !== "string" || !variable.id || ids.has(variable.id) || typeof variable.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(variable.name) || names.has(variable.name.toLowerCase()) || ![
			"static",
			"generate",
			"human",
			"response"
		].includes(variable.source)) throw new Error("Variables need unique IDs and names (letters, digits and underscore; start with a letter or underscore).");
		ids.add(variable.id);
		names.add(variable.name.toLowerCase());
		if (variable.source === "static") staticVariableValue(variable);
		if (variable.source === "generate") validateGenerator(variable);
		if (variable.source === "human" && (typeof variable.prompt !== "string" || !variable.prompt.trim() || ![
			"text",
			"number",
			"boolean",
			"json"
		].includes(variable.valueType))) throw new Error(`Enter a question and type for ${variable.name}.`);
		if (variable.source === "response") {
			if (!stepIds.has(variable.stepId)) throw new Error(`Choose an existing source step for ${variable.name}.`);
			pointerParts(variable.responsePointer);
		}
	}
	for (const step of blueprint.steps) for (const input of step.inputs ?? []) if (input.source === "variable" && !ids.has(input.variableId)) throw new Error(`Unknown shared variable in ${step.label}.`);
}
// Necto.UI/src/features/scenario-builder/connections.js
var connectionKey = (from, to) => JSON.stringify([from, to]);
function allConnections(blueprint) {
	const edges = /* @__PURE__ */ new Map();
	const add = (edge) => edges.set(connectionKey(edge.from, edge.to), edge);
	if (blueprint.version >= 3) for (const edge of blueprint.connections ?? []) add(edge);
	else for (const step of blueprint.steps) for (const from of step.dependsOn) add({
		from,
		to: step.id
	});
	for (const step of blueprint.steps) for (const input of step.inputs) {
		const from = variableProducer(input, blueprint);
		if (!from) continue;
		const key = connectionKey(from, step.id);
		if (!edges.has(key)) add({
			from,
			to: step.id
		});
	}
	for (const step of blueprint.steps) if (![...edges.values()].some((edge) => edge.to === step.id)) add({
		from: null,
		to: step.id
	});
	return [...edges.values()];
}
// Necto.UI/src/features/scenario-builder/model.js
var newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
var newBlueprint = () => ({
	format: "necto-scenario-builder",
	version: 5,
	connections: [],
	variables: [],
	id: newId(),
	name: "Untitled scenario",
	concurrency: 4,
	steps: []
});
function newStep(operation, session) {
	return {
		id: newId(),
		label: operation.name,
		operationKey: operation.key,
		apiId: operation.apiId ?? "local",
		method: operation.method,
		path: operation.path,
		dependsOn: [],
		inputs: [],
		request: {
			fields: { ...session.fields },
			body: session.body ?? "",
			...payloadSnapshot(session),
			...executionOptions(session),
			assertions: [],
			serverIndex: session.serverIndex,
			serverValues: { ...session.serverValues }
		}
	};
}
function assignPointer(value, parts, replacement) {
	if (!parts.length) return replacement;
	const root = value;
	for (const [index, part] of parts.entries()) {
		if (!value || typeof value !== "object") throw new Error("The target JSON path crosses a scalar. Edit the request body first.");
		if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(part) || Number(part) >= value.length)) throw new Error("Target array index must already exist in the request body.");
		if (index === parts.length - 1) Object.defineProperty(value, part, {
			value: replacement,
			writable: true,
			enumerable: true,
			configurable: true
		});
		else {
			if (!Object.hasOwn(value, part)) Object.defineProperty(value, part, {
				value: {},
				writable: true,
				enumerable: true,
				configurable: true
			});
			value = value[part];
		}
	}
	return root;
}
function inputKey(input) {
	return JSON.stringify([input.location, input.location === "body" ? input.pointer : input.name]);
}
function applyInput(session, operation, input, value) {
	if (input.location !== "body") {
		if (value === null || value === void 0) throw new Error(`${input.location}:${input.name} has no value.`);
		session.fields[`${input.location}:${input.name}`] = typeof value === "object" ? JSON.stringify(value) : String(value);
	} else {
		const media = bodyContent(operation, session)?.[0];
		if (!isJson(media ?? "")) {
			if (input.pointer || [
				"multipart/form-data",
				"application/x-www-form-urlencoded",
				"application/octet-stream"
			].includes(media)) throw new Error("Dynamic body inputs require JSON, or a whole text/XML body.");
			session.body = typeof value === "string" ? value : JSON.stringify(value);
		} else {
			const parts = pointerParts(input.pointer);
			const body = parts.length ? JSON.parse(session.body.trim() || "{}") : null;
			session.body = JSON.stringify(assignPointer(body, parts, value), null, 2);
		}
	}
}
function dependencies(step, blueprint) {
	return [.../* @__PURE__ */ new Set([...blueprint?.version >= 3 ? allConnections(blueprint).filter((edge) => edge.to === step.id && edge.from !== null).map((edge) => edge.from) : step.dependsOn, ...step.inputs.filter((input) => input.source === "response").map((input) => input.stepId)])];
}
function layers(blueprint) {
	const remaining = new Map(blueprint.steps.map((step) => [step.id, step])), done = /* @__PURE__ */ new Set(), result = [];
	while (remaining.size) {
		const ready = [...remaining.values()].filter((step) => dependencies(step, blueprint).every((id) => done.has(id)));
		if (!ready.length) throw new Error("Scenario contains a cycle or a missing dependency. Remove the circular connection.");
		result.push(ready);
		for (const step of ready) {
			done.add(step.id);
			remaining.delete(step.id);
		}
	}
	return result;
}
function validateBlueprint(blueprint) {
	if (blueprint?.format !== "necto-scenario-builder" || ![
		1,
		2,
		3,
		4,
		5
	].includes(blueprint.version) || typeof blueprint.id !== "string" || !blueprint.id || typeof blueprint.name !== "string" || !blueprint.name.trim() || blueprint.name.length > 200 || !Array.isArray(blueprint.steps) || blueprint.steps.length > 100 || !Number.isInteger(blueprint.concurrency) || blueprint.concurrency < 1 || blueprint.concurrency > 8) throw new Error("Invalid Scenario Builder definition (maximum 100 steps; parallelism 1–8).");
	if (blueprint.version < 3 && blueprint.connections !== void 0 && (!Array.isArray(blueprint.connections) || blueprint.connections.length)) throw new Error("Connections require Scenario Builder version 3.");
	const ids = /* @__PURE__ */ new Set();
	for (const step of blueprint.steps) {
		if (typeof step.id !== "string" || !step.id || ids.has(step.id) || typeof step.label !== "string" || !step.label.trim() || step.label.length > 200 || typeof step.operationKey !== "string" || typeof step.apiId !== "string" || typeof step.method !== "string" || typeof step.path !== "string" || !Array.isArray(step.dependsOn) || step.dependsOn.length > 100 || !Array.isArray(step.inputs) || step.inputs.length > 100 || !step.request || typeof step.request.body !== "string" || !step.request.fields || Array.isArray(step.request.fields) || typeof step.request.fields !== "object" || Object.values(step.request.fields).some((value) => typeof value !== "string")) throw new Error("Invalid scenario step or request.");
		if (step.position !== void 0 && (!step.position || !Number.isFinite(step.position.x) || !Number.isFinite(step.position.y) || step.position.x < 20 || step.position.y < 20 || step.position.x > 2e4 || step.position.y > 2e4)) throw new Error("Invalid request position.");
		ids.add(step.id);
		if (blueprint.version === 1 && (step.delayMs !== void 0 || step.waitFor !== void 0)) throw new Error("Delay and response waiting require Scenario Builder version 2.");
		if (blueprint.version >= 3 && (step.dependsOn.length || step.delayMs !== void 0 || step.waitFor !== void 0)) throw new Error("In version 3+, dependencies and timing belong to connections.");
		if (Object.keys(step.request.bodyFieldEdits ?? {}).length) throw new Error(`${step.label}: finish entering a number at ${Object.keys(step.request.bodyFieldEdits)[0] || "(body)"} before saving or running. Use Raw JSON for an intentional invalid payload.`);
		validateWaiting(step);
		validatePayloadSnapshot(step.request);
		executionOptions(step.request);
		validateAssertions(step.request.assertions ?? []);
		if (step.request.binaryFile && !(step.request.binaryFile instanceof Blob) || step.request.formFields?.some((row) => row.files && (!Array.isArray(row.files) || row.files.some((file) => !(file instanceof Blob))))) throw new Error("Attach files in the browser; imported file data is not executable.");
		const targets = [];
		for (const input of step.inputs) {
			if (![
				"path",
				"query",
				"header",
				"body"
			].includes(input.location) || ![
				"response",
				"human",
				"generate",
				"variable",
				"preset"
			].includes(input.source) || input.location !== "body" && (typeof input.name !== "string" || !input.name || /[\r\n]/.test(input.name))) throw new Error(`Invalid input in ${step.label}.`);
			const path = input.location === "body" ? pointerParts(input.pointer) : [input.location === "header" ? input.name.toLowerCase() : input.name];
			if (targets.some((target) => target.location === input.location && (input.location !== "body" ? target.path[0] === path[0] : path.slice(0, Math.min(path.length, target.path.length)).every((part, index) => part === target.path[index])))) throw new Error(`Overlapping input targets in ${step.label}.`);
			targets.push({
				location: input.location,
				path
			});
			if (input.source === "preset" && input.location === "body" && input.pointer === "") throw new Error("Presets match named body fields. Choose a field instead of the whole body.");
			if (input.source === "preset" && blueprint.version < 5) throw new Error("Explicit preset sources require Scenario Builder version 5.");
			if (input.source === "response") {
				if (typeof input.stepId !== "string") throw new Error("Choose a source step.");
				pointerParts(input.responsePointer);
			}
			if (input.source === "generate") validateGenerator(input);
			if (input.source === "human" && (typeof input.prompt !== "string" || !input.prompt.trim() || ![
				"text",
				"number",
				"boolean",
				"json"
			].includes(input.valueType))) throw new Error("Human inputs need a question and value type.");
		}
	}
	if (blueprint.version >= 3) {
		if (!Array.isArray(blueprint.connections) || blueprint.connections.length > 1e3) throw new Error("Invalid connection collection (maximum 1000).");
		const pairs = /* @__PURE__ */ new Set();
		for (const edge of blueprint.connections) {
			if (!edge || !(edge.from === null || ids.has(edge.from)) || !ids.has(edge.to) || edge.from === edge.to || pairs.has(connectionKey(edge.from, edge.to))) throw new Error("Invalid, duplicate or self connection.");
			pairs.add(connectionKey(edge.from, edge.to));
			validateWaiting(edge);
		}
	}
	validateVariables(blueprint);
	for (const step of blueprint.steps) if (dependencies(step, blueprint).some((id) => !ids.has(id) || id === step.id)) throw new Error(`Invalid dependency in ${step.label}.`);
	layers(blueprint);
	return blueprint;
}
function parseHuman(value, type) {
	if (value === void 0 || String(value).trim() === "") throw new Error("Enter a value before continuing.");
	if (type === "json") return JSON.parse(value);
	if (type === "number") {
		const number = Number(value);
		if (!Number.isFinite(number)) throw new Error("Enter a finite number.");
		return number;
	}
	if (type === "boolean") {
		if (!["true", "false"].includes(value)) throw new Error("Enter true or false.");
		return value === "true";
	}
	return String(value);
}
function parseBlueprint(text) {
	if (text.length > 2097152) throw new Error("Scenario Builder imports are limited to 2 MB.");
	return validateBlueprint(JSON.parse(text));
}
export { applyInput, dependencies, inputKey, layers, newBlueprint, newId, newStep, parseBlueprint, parseHuman, pointerParts, readPointer, validateBlueprint };
