import { Allocator, MemoryBlockRef } from '../../allocator';

export class ResizableArray {
  private _length = 0;
  private _capacity: number;
  private _block: MemoryBlockRef;
  public readonly __ID: number;

  public get length() {
    return this._length;
  }

  public get capacity() {
    return this._capacity;
  }

  constructor(
    private readonly _allocator: Allocator,
    private readonly _initialCapacity = 10
  ) {
    this._capacity = this._initialCapacity;
    this._block = this._allocator.allocate(8 + this._capacity * 4); // 8 bytes for metadata (length and capacity)
    this.__ID = this._allocator.registerStructure(this);
    this.saveMetadata();
  }

  private saveMetadata() {
    this._allocator.view.setUint32(this._block.offset, this._length);
    this._allocator.view.setUint32(this._block.offset + 4, this._capacity);
  }

  private loadMetadata() {
    this._length = this._allocator.view.getUint32(this._block.offset);
    this._capacity = this._allocator.view.getUint32(this._block.offset + 4);
  }

  public push(value: number) {
    if (this._length >= this._capacity) {
      this.resize();
    }
    this._allocator.view.setUint32(this._block.offset + 8 + this._length * 4, value);
    this._length++;
    this.saveMetadata();
  }

  private resize() {
    const newCapacity = this._capacity * 2;
    const newBlock = this._allocator.allocate(8 + newCapacity * 4);

    const oldView = new Uint8Array(this._allocator.buffer, this._block.offset + 8, this._capacity * 4);
    const newView = new Uint8Array(this._allocator.buffer, newBlock.offset + 8, newCapacity * 4);
    newView.set(oldView);

    this._allocator.free(this._block);
    this._capacity = newCapacity;
    this._block = newBlock;
    this.saveMetadata();
  }

  public get(index: number): number {
    if (index >= this._length) {
      throw new Error('Index out of bounds');
    }

    return this._allocator.view.getUint32(this._block.offset + 8 + index * 4);
  }

  public restore(offset: number) {
    this._block = new MemoryBlockRef(offset, this._capacity * 4 + 8);
    this.loadMetadata();
  }
}
