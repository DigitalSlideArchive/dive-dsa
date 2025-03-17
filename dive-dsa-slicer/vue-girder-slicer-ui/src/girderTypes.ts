type GirderModelType = 'item' | 'folder' | 'file' | 'user' | 'collection';

interface GirderModelBase {
  name: string;
  _id: string;
  _modelType: GirderModelType;
  created: string;
  updated: string;
  public: boolean;
  parentId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: { [key: string]: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface GirderModel extends GirderModelBase {
  baseParentType: GirderModelType;
  creatorId: string;
  description: string;
  parentCollection?: string;
}

export type {
    GirderModelType,
    GirderModelBase,
    GirderModel,
}