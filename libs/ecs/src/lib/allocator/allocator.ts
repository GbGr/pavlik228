import { IResizableStruct, IFixedStruct } from './structures/structures.types';

export class MemoryBlockRef {
  constructor(
    public readonly offset: number,
    public readonly size: number
  ) {}
}

export class Allocator {
  private _buffer: ArrayBuffer;
  private _view: DataView;
  private readonly _structures: Map<number, { offset: number, struct: IResizableStruct | IFixedStruct }> = new Map();
  private _nextId = 0;

  public get buffer(): ArrayBuffer {
    return this._buffer;
  }

  public get view(): DataView {
    return this._view;
  }

  constructor(
    private readonly _initialBufferSize: number,
    private readonly maxFreeBlocks = 100
  ) {
    this._buffer = new ArrayBuffer(this._initialBufferSize);
    this._view = new DataView(this._buffer);
    // Initialize offset to account for initial metadata
    const initialOffset = 12 + this.maxFreeBlocks * 8;
    this._view.setUint32(0, initialOffset); // Set initial offset for memory allocation
    this._view.setUint32(4, 0); // Initialize free block count
    this._view.setUint32(8, 0); // Initialize structures count
  }

  public allocate(size: number): MemoryBlockRef {
    const freeBlockCount = this._view.getUint32(4);

    // Try to find a suitable free block
    for (let i = 0; i < freeBlockCount; i++) {
      const offset = 12 + i * 8;
      const blockOffset = this._view.getUint32(offset);
      const blockSize = this._view.getUint32(offset + 4);
      if (blockSize >= size) {
        const remainingSize = blockSize - size;

        if (remainingSize > 0) {
          // Update the free block with the remaining size
          this._view.setUint32(offset, blockOffset + size);
          this._view.setUint32(offset + 4, remainingSize);
        } else {
          // Remove the free block if it is completely used
          this.removeFreeBlock(i);
        }

        return new MemoryBlockRef(blockOffset, size);
      }
    }

    // If no suitable free block, allocate at the end
    let offset = this._view.getUint32(0);
    if (offset + size > this._buffer.byteLength) {
      this.expandBuffer();
      offset = this._view.getUint32(0);
    }
    this._view.setUint32(0, offset + size);
    return new MemoryBlockRef(offset, size);
  }

  public free(block: MemoryBlockRef) {
    const freeBlockCount = this._view.getUint32(4);
    if (freeBlockCount >= this.maxFreeBlocks) {
      throw new Error('Free block list is full');
    }
    const offset = 12 + freeBlockCount * 8;
    this._view.setUint32(offset, block.offset);
    this._view.setUint32(offset + 4, block.size);
    this._view.setUint32(4, freeBlockCount + 1);
    this.coalesceFreeBlocks();
  }

  private removeFreeBlock(index: number) {
    const freeBlockCount = this._view.getUint32(4) - 1;
    this._view.setUint32(4, freeBlockCount);
    if (index < freeBlockCount) {
      const lastOffset = 12 + freeBlockCount * 8;
      const offset = 12 + index * 8;
      this._view.setUint32(offset, this._view.getUint32(lastOffset));
      this._view.setUint32(offset + 4, this._view.getUint32(lastOffset + 4));
    }
  }

  private coalesceFreeBlocks() {
    const freeBlockCount = this._view.getUint32(4);
    const freeBlocks = [];

    // Extract free blocks into a temporary array for sorting and merging
    for (let i = 0; i < freeBlockCount; i++) {
      const offset = 12 + i * 8;
      const blockOffset = this._view.getUint32(offset);
      const blockSize = this._view.getUint32(offset + 4);
      freeBlocks.push({ offset: blockOffset, size: blockSize });
    }

    // Sort free blocks by offset
    freeBlocks.sort((a, b) => a.offset - b.offset);

    // Merge adjacent free blocks
    const mergedBlocks = [];
    for (let i = 0; i < freeBlocks.length; i++) {
      if (mergedBlocks.length === 0 || mergedBlocks[mergedBlocks.length - 1].offset + mergedBlocks[mergedBlocks.length - 1].size < freeBlocks[i].offset) {
        mergedBlocks.push(freeBlocks[i]);
      } else {
        mergedBlocks[mergedBlocks.length - 1].size += freeBlocks[i].size;
      }
    }

    // Save merged blocks back to the buffer
    for (let i = 0; i < mergedBlocks.length; i++) {
      const offset = 12 + i * 8;
      this._view.setUint32(offset, mergedBlocks[i].offset);
      this._view.setUint32(offset + 4, mergedBlocks[i].size);
    }

    // Update the free block count
    this._view.setUint32(4, mergedBlocks.length);
  }

  private expandBuffer() {
    const newBufferSize = this._buffer.byteLength * 2;
    const newBuffer = new ArrayBuffer(newBufferSize);
    const newView = new DataView(newBuffer);

    const oldUint8Array = new Uint8Array(this._buffer);
    const newUint8Array = new Uint8Array(newBuffer);
    newUint8Array.set(oldUint8Array);

    this._buffer = newBuffer;
    this._view = newView;

    this.restoreStructures();
  }

  public registerStructure(structure: IResizableStruct | IFixedStruct): number {
    const id = this._nextId++;
    const offset = this._view.getUint32(0);
    this._structures.set(id, { offset, struct: structure });

    const structuresCount = this._view.getUint32(8);
    const structOffset = 12 + this.maxFreeBlocks * 8 + structuresCount * 8;
    this._view.setUint32(structOffset, id);
    this._view.setUint32(structOffset + 4, offset);
    this._view.setUint32(8, structuresCount + 1);

    return id;
  }

  public getStructureOffset(id: number): number {
    const entry = this._structures.get(id);
    if (!entry) {
      throw new Error(`Structure with ID ${id} not found`);
    }
    return entry.offset;
  }

  static fromBuffer(buffer: ArrayBuffer): Allocator {
    const allocator = new Allocator(buffer.byteLength);
    allocator._buffer = buffer.slice(0);
    allocator._view = new DataView(allocator._buffer);
    allocator.restoreStructures();
    return allocator;
  }

  private restoreStructures() {
    const structuresCount = this._view.getUint32(8);
    for (let i = 0; i < structuresCount; i++) {
      const structOffset = 12 + this.maxFreeBlocks * 8 + i * 8;
      const id = this._view.getUint32(structOffset);
      const offset = this._view.getUint32(structOffset + 4);
      const struct = this._structures.get(id)!.struct;

      if (!struct) throw new Error(`Structure with ID ${id} not found`);

      struct.restore(offset);
    }
  }
}
