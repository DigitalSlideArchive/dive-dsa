import Track from './track';
import BaseAnnotationStore from './BaseAnnotationStore';
import BaseAnnotation, { AnnotationId } from './BaseAnnotation';

export default class TrackStore extends BaseAnnotationStore<Track> {
  add(
    frame: number,
    defaultType: string,
    afterId: AnnotationId | undefined,
    overrideTrackId: number,
    meta: undefined | BaseAnnotation['meta'] = undefined,
  ) {
    const track = new Track(overrideTrackId, {
      begin: frame,
      end: frame,
      confidencePairs: [[defaultType, 1]],
      meta,
    });
    this.insert(track, { afterId });
    this.markChangesPending({ action: 'upsert', track, cameraName: this.cameraName });
    return track;
  }

  getUserAttributeList() {
    let userList = new Set<string>();
    this.annotationMap.forEach((item) => {
      userList = new Set([...userList, ...item.getUserAttributeList()]);
    });
    return userList;
  }
}
