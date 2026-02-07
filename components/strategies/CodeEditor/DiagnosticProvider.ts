import type Monaco from 'monaco-editor';
import { LiveValidator } from '@/lib/python-runtime/live-validator';

const validator = new LiveValidator();

export function registerDiagnosticProvider(monaco: Monaco): void {
  const updateDiagnostics = (model: monaco.editor.ITextModel) => {
    const code = model.getValue();
    const validation = validator.validate(code);
    
    const markers: monaco.editor.IMarkerData[] = [];
    
    validation.errors.forEach((err) => {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: err.line,
        startColumn: err.column || 1,
        endLineNumber: err.line,
        endColumn: err.column ? err.column + 10 : 100,
        source: 'Python Validation',
        relatedInformation: err.rule ? [{
          message: `Rule: ${err.rule}`,
          resource: model.uri
        }] : undefined
      });
    });
    
    validation.warnings.forEach((warn) => {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: warn.message,
        startLineNumber: warn.line,
        startColumn: warn.column || 1,
        endLineNumber: warn.line,
        endColumn: warn.column ? warn.column + 10 : 100,
        source: 'Python Validation'
      });
    });
    
    validation.structureIssues.forEach((issue) => {
      markers.push({
        severity: issue.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: issue.message,
        startLineNumber: issue.line,
        startColumn: 1,
        endLineNumber: issue.line,
        endColumn: 100,
        source: 'Strategy Structure',
        relatedInformation: issue.suggestion ? [{
          message: `Suggestion: ${issue.suggestion}`,
          resource: model.uri
        }] : undefined
      });
    });
    
    monaco.editor.setModelMarkers(model, model.id, markers);
  };
  
  monaco.editor.onDidCreateModel((model) => {
    updateDiagnostics(model);
    const disposable = model.onDidChangeContent(() => {
      clearTimeout((model as any)._validationTimeout);
      (model as any)._validationTimeout = setTimeout(() => {
        updateDiagnostics(model);
      }, 500);
    });
    
    (model as any)._validationDisposable = disposable;
  });
  
  monaco.editor.onWillDisposeModel((model) => {
    const disposable = (model as any)._validationDisposable;
    if (disposable) {
      disposable.dispose();
    }
    clearTimeout((model as any)._validationTimeout);
  });
}
