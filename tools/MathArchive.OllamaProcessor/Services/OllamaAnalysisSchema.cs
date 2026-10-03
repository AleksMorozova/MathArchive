using System.Text.Json.Nodes;

namespace MathArchive.OllamaProcessor.Services;

internal static class OllamaAnalysisSchema
{
    public static JsonNode Create() => JsonNode.Parse(SchemaJson)!;

    private const string SchemaJson = """
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": { "type": "string", "minLength": 1 },
            "sourceLanguage": { "type": "string", "minLength": 2 },
            "suggestedGrade": { "type": ["integer", "null"], "minimum": 5, "maximum": 11 },
            "suggestedTopic": { "type": "string", "minLength": 1 },
            "sections": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "id": { "type": "string", "minLength": 1 },
                  "type": { "type": "string", "enum": ["Definition", "FormulaGroup", "Rule", "Algorithm", "Example", "Table", "Graph", "NumberLine", "Geometry", "Text", "ImportantNote"] },
                  "title": { "type": "string", "minLength": 1 },
                  "text": { "type": ["string", "null"] },
                  "formulas": { "type": "array", "items": { "type": "string", "minLength": 1 } },
                  "table": {
                    "type": ["object", "null"],
                    "additionalProperties": false,
                    "properties": {
                      "headers": { "type": "array", "items": { "type": "string" } },
                      "rows": { "type": "array", "items": { "type": "array", "items": { "type": "string" } } }
                    },
                    "required": ["headers", "rows"]
                  },
                  "visual": {
                    "type": ["object", "null"],
                    "additionalProperties": false,
                    "properties": {
                      "kind": { "type": "string", "enum": ["FunctionGraph", "NumberLine", "Geometry"] },
                      "functions": { "type": "array", "items": { "type": "string" } },
                      "importantPoints": { "type": "array", "items": { "type": "object", "additionalProperties": false, "properties": { "x": { "type": "number" }, "y": { "type": "number" } }, "required": ["x", "y"] } },
                      "min": { "type": ["number", "null"] },
                      "max": { "type": ["number", "null"] },
                      "points": { "type": "array", "items": { "type": "object", "additionalProperties": false, "properties": { "label": { "type": "string" }, "value": { "type": "number" } }, "required": ["label", "value"] } },
                      "labels": { "type": "array", "items": { "type": "string" } },
                      "relationships": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["kind", "functions", "importantPoints", "min", "max", "points", "labels", "relationships"]
                  }
                },
                "required": ["id", "type", "title", "text", "formulas", "table", "visual"]
              }
            },
            "warnings": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "type": { "type": "string", "enum": ["FormulaUncertain", "TextUncertain", "GraphUncertain", "TableUncertain", "GradeUncertain", "TranslationUncertain"] },
                  "sectionId": { "type": ["string", "null"] },
                  "message": { "type": "string", "minLength": 1 }
                },
                "required": ["type", "sectionId", "message"]
              }
            }
          },
          "required": ["title", "sourceLanguage", "suggestedGrade", "suggestedTopic", "sections", "warnings"]
        }
        """;
}
