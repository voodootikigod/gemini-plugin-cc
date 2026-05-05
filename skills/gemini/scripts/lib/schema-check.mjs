// Minimal JSON Schema validator covering the subset used in skills/gemini/schemas:
//   type, enum, required, additionalProperties, properties, items,
//   minLength, minimum, maximum.
// Returns an array of human-readable error strings ([] when valid).

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function checkType(value, expected, path, errors) {
  if (expected == null) return true;
  const actual = typeOf(value);
  // JSON Schema "integer" treated as number.
  const ok = expected === "integer"
    ? actual === "number" && Number.isInteger(value)
    : actual === expected;
  if (!ok) {
    errors.push(`${path || "<root>"}: expected ${expected}, got ${actual}`);
    return false;
  }
  return true;
}

function pathJoin(parent, key) {
  if (parent === "") return String(key);
  return typeof key === "number" ? `${parent}[${key}]` : `${parent}.${key}`;
}

export function validateAgainstSchema(value, schema, path = "") {
  const errors = [];
  if (!schema || typeof schema !== "object") return errors;

  if (schema.type && !checkType(value, schema.type, path, errors)) {
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path || "<root>"}: value ${JSON.stringify(value)} is not one of [${schema.enum.map((v) => JSON.stringify(v)).join(", ")}]`);
  }

  if (schema.type === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path || "<root>"}: string shorter than minLength ${schema.minLength}`);
    }
  }

  if (schema.type === "number" || schema.type === "integer") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path || "<root>"}: ${value} < minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path || "<root>"}: ${value} > maximum ${schema.maximum}`);
    }
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required || []) {
      if (!(k in value)) errors.push(`${path || "<root>"}: missing required key '${k}'`);
    }
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!(k in props)) errors.push(`${path || "<root>"}: unexpected key '${k}'`);
      }
    }
    for (const [k, sub] of Object.entries(props)) {
      if (k in value) {
        errors.push(...validateAgainstSchema(value[k], sub, pathJoin(path, k)));
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, idx) => {
      errors.push(...validateAgainstSchema(item, schema.items, pathJoin(path, idx)));
    });
  }

  return errors;
}

// Convenience: collect all enum string values from a schema (recursive).
// Used to surface allowed enum tokens to the model in JSON-mode prompt addenda.
export function collectEnums(schema, byPath = {}, path = "") {
  if (!schema || typeof schema !== "object") return byPath;
  if (Array.isArray(schema.enum)) {
    byPath[path || "<root>"] = schema.enum.slice();
  }
  if (schema.properties) {
    for (const [k, sub] of Object.entries(schema.properties)) {
      collectEnums(sub, byPath, pathJoin(path, k));
    }
  }
  if (schema.items) {
    collectEnums(schema.items, byPath, `${path}[]`);
  }
  return byPath;
}
