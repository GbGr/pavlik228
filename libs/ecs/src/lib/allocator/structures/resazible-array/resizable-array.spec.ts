import { Allocator } from '../../allocator';
import { ResizableArray } from './resizable-array';

describe('ResizableArray', () => {
  it('should initialize with correct capacity', () => {
    const allocator = new Allocator(1024);
    const array = new ResizableArray(allocator, 10);
    expect(array.capacity).toBe(10);
  });

  it('should push elements correctly', () => {
    const allocator = new Allocator(1024);
    const array = new ResizableArray(allocator, 10);
    array.push(42);
    array.push(84);
    expect(array.get(0)).toBe(42);
    expect(array.get(1)).toBe(84);
    expect(array.length).toBe(2);
  });

  it('should resize correctly when capacity is reached', () => {
    const allocator = new Allocator(1024);
    const array = new ResizableArray(allocator, 2);
    array.push(1);
    array.push(2);
    array.push(3); // This should trigger a resize
    expect(array.capacity).toBe(4);
    expect(array.length).toBe(3);
    expect(array.get(2)).toBe(3);
  });

  it('should throw error when accessing out of bounds', () => {
    const allocator = new Allocator(1024);
    const array = new ResizableArray(allocator, 2);
    expect(() => array.get(0)).toThrow('Index out of bounds');
  });

  it('should restore state from buffer', () => {
    const allocator = new Allocator(1024);
    const array = new ResizableArray(allocator, 2);
    array.push(42);
    array.push(84);
    const buffer = allocator.buffer.slice(0);

    const restoredAllocator = Allocator.fromBuffer(buffer);
    const restoredArray = new ResizableArray(restoredAllocator);
    const offset = restoredAllocator.getStructureOffset(array.__ID);
    restoredArray.restore(offset);

    console.log('array', array.__ID, array.length, array.capacity, allocator.getStructureOffset(array.__ID));
    console.log('restoredArray', restoredArray.__ID, restoredArray.length, restoredArray.capacity, restoredAllocator.getStructureOffset(array.__ID));

    expect(restoredArray.get(0)).toBe(42);
    expect(restoredArray.get(1)).toBe(84);
    expect(restoredArray.length).toBe(2);
    expect(restoredArray.capacity).toBe(2);
  });

  it('should handle multiple resizes', () => {
    const allocator = new Allocator(1024);
    const array = new ResizableArray(allocator, 2);
    for (let i = 0; i < 10; i++) {
      array.push(i);
    }
    expect(array.length).toBe(10);
    expect(array.capacity).toBeGreaterThanOrEqual(10);
    for (let i = 0; i < 10; i++) {
      expect(array.get(i)).toBe(i);
    }
  });

  it('should handle multiple ResizableArray instances', () => {
    const allocator = new Allocator(1024);
    const array1 = new ResizableArray(allocator, 2);
    const array2 = new ResizableArray(allocator, 2);

    for (let i = 0; i < 10; i++) {
      array1.push(i);
      array2.push(i * 10);
    }

    expect(array1.length).toBe(10);
    expect(array2.length).toBe(10);

    for (let i = 0; i < 10; i++) {
      expect(array1.get(i)).toBe(i);
      expect(array2.get(i)).toBe(i * 10);
    }
  });

  it('should handle multiple ResizableArray instances and restore state from buffer', () => {
    const allocator = new Allocator(1024);
    const array1 = new ResizableArray(allocator, 2);
    const array2 = new ResizableArray(allocator, 2);

    for (let i = 0; i < 10; i++) {
      array1.push(i);
      array2.push(i * 10);
    }

    const buffer = allocator.buffer;
    const restoredAllocator = Allocator.fromBuffer(buffer);
    const restoredArray1 = new ResizableArray(restoredAllocator);
    const restoredArray2 = new ResizableArray(restoredAllocator);

    const offset1 = restoredAllocator.getStructureOffset(array1.__ID);
    const offset2 = restoredAllocator.getStructureOffset(array2.__ID);
    restoredArray1.restore(offset1);
    restoredArray2.restore(offset2);

    expect(restoredArray1.length).toBe(10);
    expect(restoredArray2.length).toBe(10);

    for (let i = 0; i < 10; i++) {
      expect(restoredArray1.get(i)).toBe(i);
      expect(restoredArray2.get(i)).toBe(i * 10);
    }
  });
});
