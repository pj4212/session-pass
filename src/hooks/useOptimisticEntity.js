import { useState, useCallback } from 'react';

/**
 * Hook for optimistic UI updates on entity CRUD operations.
 * 
 * Usage:
 *   const { items, setItems, optimisticCreate, optimisticUpdate, optimisticDelete } = useOptimisticEntity(initialItems);
 */
export default function useOptimisticEntity(initial = []) {
  const [items, setItems] = useState(initial);

  const optimisticCreate = useCallback(async (tempItem, createFn) => {
    const tempId = `temp_${Date.now()}`;
    const optimistic = { ...tempItem, id: tempId, _optimistic: true };
    setItems(prev => [...prev, optimistic]);
    
    const created = await createFn();
    setItems(prev => prev.map(item => item.id === tempId ? { ...created, _optimistic: false } : item));
    return created;
  }, []);

  const optimisticUpdate = useCallback(async (id, updates, updateFn) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates, _optimistic: true } : item
    ));

    const updated = await updateFn();
    setItems(prev => prev.map(item =>
      item.id === id ? { ...updated, _optimistic: false } : item
    ));
    return updated;
  }, []);

  const optimisticDelete = useCallback(async (id, deleteFn) => {
    const backup = items;
    setItems(prev => prev.filter(item => item.id !== id));

    try {
      await deleteFn();
    } catch (err) {
      // Rollback on failure
      setItems(backup);
      throw err;
    }
  }, [items]);

  return { items, setItems, optimisticCreate, optimisticUpdate, optimisticDelete };
}