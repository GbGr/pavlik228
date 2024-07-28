export interface IResizableStruct {
  length: number;
  capacity: number;
  restore(offset: number): void;
}

export interface IFixedStruct {
  restore(offset: number): void;
}
