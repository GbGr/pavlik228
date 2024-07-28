import { describe, it, expect } from 'vitest';
import { Allocator, MemoryBlockRef } from './allocator';

describe('Allocator', () => {
  it('should allocate memory correctly', () => {
    const allocator = new Allocator(1024);
    const block = allocator.allocate(100);
    expect(block.size).toBe(100);
    expect(block.offset).toBeGreaterThanOrEqual(0);
  });

  it('should expand buffer when needed', () => {
    const allocator = new Allocator(1024);
    const block1 = allocator.allocate(900);
    const block2 = allocator.allocate(200);
    expect(block2.offset).toBe(block1.offset + block1.size);
  });

  it('should free memory correctly', () => {
    const allocator = new Allocator(1024);
    const block = allocator.allocate(100);
    allocator.free(block);

    // Try to allocate a smaller block and ensure it uses the freed space
    const newBlock = allocator.allocate(50);
    expect(newBlock.offset).toBe(block.offset);
  });

  it('should coalesce adjacent free blocks', () => {
    const allocator = new Allocator(1024);
    const block1 = allocator.allocate(100);
    const block2 = allocator.allocate(100);
    allocator.free(block1);
    allocator.free(block2);

    // Allocate a block that fits into the coalesced space
    const block3 = allocator.allocate(200);
    expect(block3.offset).toBe(block1.offset);
  });

  it('should restore state from buffer', () => {
    const allocator = new Allocator(1024);
    const block1 = allocator.allocate(100);
    const buffer = allocator.buffer.slice(0);

    const restoredAllocator = Allocator.fromBuffer(buffer);
    const block2 = restoredAllocator.allocate(50);

    expect(block2.offset).toBeGreaterThanOrEqual(block1.offset + block1.size);
  });

  it('should handle maximum free blocks', () => {
    const allocator = new Allocator(1024, 10);
    const blocks: MemoryBlockRef[] = [];

    // Fill the free block list to the maximum
    for (let i = 0; i < 20; i++) {
      const block = allocator.allocate(10);
      if (i % 2 === 0) blocks.push(block);
    }

    blocks.forEach((block) => allocator.free(block));

    // Free another block and ensure it throws an error
    const extraBlock = allocator.allocate(11);
    expect(() => allocator.free(extraBlock)).toThrow('Free block list is full');
  });

  it('should initialize with correct metadata', () => {
    const allocator = new Allocator(1024);
    expect(allocator.view.getUint32(0)).toBe(12 + 100 * 8); // Initial offset
    expect(allocator.view.getUint32(4)).toBe(0); // Initial free block count
    expect(allocator.view.getUint32(8)).toBe(0); // Initial structure count
  });

  it('should allocate memory correctly and not corrupt metadata', () => {
    const allocator = new Allocator(1024);
    const block1 = allocator.allocate(100);
    const block2 = allocator.allocate(200);

    // Verify the metadata
    expect(allocator.view.getUint32(0)).toBe(block2.offset + block2.size);
    expect(allocator.view.getUint32(4)).toBe(0); // Free block count should be 0
    expect(allocator.view.getUint32(8)).toBe(0); // Structure count should be 0

    // Fill the allocated blocks with data
    const buffer = allocator.buffer;
    const view = new DataView(buffer);
    for (let i = 0; i < 100; i++) {
      view.setUint8(block1.offset + i, i);
    }
    for (let i = 0; i < 200; i++) {
      view.setUint8(block2.offset + i, i);
    }

    // Verify the data is intact
    for (let i = 0; i < 100; i++) {
      expect(view.getUint8(block1.offset + i)).toBe(i);
    }
    for (let i = 0; i < 200; i++) {
      expect(view.getUint8(block2.offset + i)).toBe(i);
    }

    // Verify the metadata is still intact
    expect(allocator.view.getUint32(0)).toBe(block2.offset + block2.size);
    expect(allocator.view.getUint32(4)).toBe(0); // Free block count should be 0
    expect(allocator.view.getUint32(8)).toBe(0); // Structure count should be 0
  });

  it('should correctly handle freeing memory and not corrupt metadata', () => {
    const allocator = new Allocator(1024);
    const block1 = allocator.allocate(100);
    const block2 = allocator.allocate(200);

    // Free the first block
    allocator.free(block1);

    // Verify the metadata
    expect(allocator.view.getUint32(0)).toBe(block2.offset + block2.size);
    expect(allocator.view.getUint32(4)).toBe(1); // Free block count should be 1
    expect(allocator.view.getUint32(8)).toBe(0); // Structure count should be 0

    // Allocate another block and ensure it reuses the free block
    const block3 = allocator.allocate(50);
    expect(block3.offset).toBe(block1.offset);

    // Verify the metadata again
    expect(allocator.view.getUint32(0)).toBe(block2.offset + block2.size);
    expect(allocator.view.getUint32(4)).toBe(1); // Free block count should still be 1
    expect(allocator.view.getUint32(8)).toBe(0); // Structure count should be 0
  });

  it('should correctly register structures and not corrupt metadata', () => {
    const allocator = new Allocator(1024);
    const block1 = allocator.allocate(100);
    const block2 = allocator.allocate(200);

    // Register a dummy structure
    const structure = {
      restore: (offset: number) => {
        // Do nothing
      }
    };
    const id = allocator.registerStructure(structure);

    // Verify the metadata
    expect(allocator.view.getUint32(0)).toBe(block2.offset + block2.size);
    expect(allocator.view.getUint32(4)).toBe(0); // Free block count should be 0
    expect(allocator.view.getUint32(8)).toBe(1); // Structure count should be 1

    // Verify the structure metadata
    const structOffset = 12 + 100 * 8;
    expect(allocator.view.getUint32(structOffset)).toBe(id);
    expect(allocator.view.getUint32(structOffset + 4)).toBe(block2.offset + block2.size);

    // Verify data integrity in allocated blocks
    const buffer = allocator.buffer;
    const view = new DataView(buffer);
    for (let i = 0; i < 100; i++) {
      view.setUint8(block1.offset + i, i);
    }
    for (let i = 0; i < 200; i++) {
      view.setUint8(block2.offset + i, i);
    }

    for (let i = 0; i < 100; i++) {
      expect(view.getUint8(block1.offset + i)).toBe(i);
    }
    for (let i = 0; i < 200; i++) {
      expect(view.getUint8(block2.offset + i)).toBe(i);
    }

    // Verify metadata again
    expect(allocator.view.getUint32(0)).toBe(block2.offset + block2.size);
    expect(allocator.view.getUint32(4)).toBe(0); // Free block count should be 0
    expect(allocator.view.getUint32(8)).toBe(1); // Structure count should be 1
  });
});
