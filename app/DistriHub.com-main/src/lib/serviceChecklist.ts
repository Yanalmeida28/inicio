export const checklistResults = ['Funcionando', 'Com defeito', 'Não testado', 'Não se aplica'] as const;
export type ChecklistResult = typeof checklistResults[number];
export type Checklist = Record<string, ChecklistResult | ''>;
const common = [
  ['power', 'Liga e desliga'], ['charging', 'Carregamento / alimentação'], ['battery', 'Bateria'],
  ['buttons', 'Botões'], ['housing', 'Carcaça / trincas / marcas'], ['moisture', 'Condição quanto à umidade'],
] as const;
export function checklistItems(equipment: string | null) {
  return /celular|smartphone|tablet|iphone|ipad/i.test(equipment || '') ? [
    ...common, ['screen', 'Tela / imagem'], ['touch', 'Touch'], ['camera', 'Câmera frontal'], ['rear_camera', 'Câmera traseira'],
    ['flash', 'Flash'], ['microphone', 'Microfone'], ['speaker', 'Alto-falante'], ['calls', 'Áudio de chamadas'],
    ['wifi', 'Wi-Fi'], ['bluetooth', 'Bluetooth'], ['sim', 'Sinal / chip'], ['biometrics', 'Biometria / reconhecimento facial'],
    ['vibration', 'Vibração'], ['proximity', 'Sensor de proximidade'], ['connector', 'Conector de carga'],
  ] as const : [...common, ['operation', 'Funcionamento geral'], ['connections', 'Conectores / cabos']] as const;
}
export function validChecklistResult(value: unknown): value is ChecklistResult {
  return checklistResults.includes(value as ChecklistResult);
}
export function checklistComplete(equipment: string | null, values: Checklist) {
  return checklistItems(equipment).every(([key]) => validChecklistResult(values[key]));
}
export function checklistText(equipment: string | null, values: Checklist, phase: 'entrada' | 'saída') {
  return `[Checklist de ${phase}]\n${checklistItems(equipment).map(([key, label]) => `${label}: ${validChecklistResult(values[key]) ? values[key] : 'Não testado'}`).join('\n')}\n[/Checklist de ${phase}]`;
}
export function readChecklist(text: string | null | undefined, equipment: string | null, phase: 'entrada' | 'saída'): Checklist {
  const block = text?.split(`[Checklist de ${phase}]\n`)[1]?.split(`\n[/Checklist de ${phase}]`)[0];
  if (!block) return {};
  const lines = block.split('\n');
  return Object.fromEntries(checklistItems(equipment).map(([key, label]) => {
    const value = lines.find(line => line.startsWith(`${label}: `))?.slice(label.length + 2);
    return [key, validChecklistResult(value) ? value : ''];
  }));
}
export function withoutExitChecklist(text: string | null | undefined) {
  return (text || '').replace(/\s*\[Checklist de saída\][\s\S]*?\[\/Checklist de saída\]/g, '').trim();
}
