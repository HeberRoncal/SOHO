export interface EtiquetaFiltro {
  readonly texto: string;
  readonly conservarAlLimpiar?: boolean;
  readonly quitar: () => void;
}
