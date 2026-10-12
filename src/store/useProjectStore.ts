import { create } from 'zustand'

export const useProjectStore = create<{ name: string; busy: boolean; revision: number }>()(() => ({ name: 'Mi beat', busy: false, revision: 0 }))
