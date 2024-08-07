import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import { getSourceUri } from './VideoPlayer.web';
function createAudioContext() {
    return typeof window !== 'undefined' ? new window.AudioContext() : null;
}
function createZeroGainNode(audioContext) {
    const zeroGainNode = audioContext?.createGain() ?? null;
    if (audioContext && zeroGainNode) {
        zeroGainNode.gain.value = 0;
        zeroGainNode.connect(audioContext.destination);
    }
    return zeroGainNode;
}
function mapStyles(style) {
    const flattenedStyles = StyleSheet.flatten(style);
    // Looking through react-native-web source code they also just pass styles directly without further conversions, so it's just a cast.
    return flattenedStyles;
}
export function isPictureInPictureSupported() {
    const userAgent = window.navigator.userAgent;
    // Chromium and WebKit based browsers are supported
    // https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API#browser_compatibility
    return !!userAgent && (userAgent.includes('Chrome') || userAgent.includes('Safari'));
}
export const VideoView = forwardRef((props, ref) => {
    const videoRef = useRef(null);
    const mediaNodeRef = useRef(null);
    const hasToSetupAudioContext = useRef(false);
    /**
     * Audio context is used to mute all but one video when multiple video views are playing from one player simultaneously.
     * Using audio context nodes allows muting videos without displaying the mute icon in the video player.
     * We have to keep the context that called createMediaElementSource(videoRef), as the method can't be called
     * for the second time with another context and there is no way to unbind the video and audio context afterward.
     */
    const audioContextRef = useRef(null);
    const zeroGainNodeRef = useRef(null);
    useImperativeHandle(ref, () => ({
        enterFullscreen: async () => {
            if (!props.allowsFullscreen) {
                return;
            }
            await videoRef.current?.requestFullscreen();
        },
        exitFullscreen: async () => {
            await document.exitFullscreen();
        },
        startPictureInPicture: async () => {
            await videoRef.current?.requestPictureInPicture();
        },
        stopPictureInPicture: async () => {
            try {
                await document.exitPictureInPicture();
            }
            catch (e) {
                if (e instanceof DOMException && e.name === 'InvalidStateError') {
                    console.warn('The VideoView is not in Picture-in-Picture mode.');
                }
                else {
                    throw e;
                }
            }
        },
    }));
    useEffect(() => {
        const onEnter = () => {
            props.onPictureInPictureStart?.();
        };
        const onLeave = () => {
            props.onPictureInPictureStop?.();
        };
        videoRef.current?.addEventListener('enterpictureinpicture', onEnter);
        videoRef.current?.addEventListener('leavepictureinpicture', onLeave);
        return () => {
            videoRef.current?.removeEventListener('enterpictureinpicture', onEnter);
            videoRef.current?.removeEventListener('leavepictureinpicture', onLeave);
        };
    }, [videoRef, props.onPictureInPictureStop, props.onPictureInPictureStart]);
    // Adds the video view as a candidate for being the audio source for the player (when multiple views play from one
    // player only one will emit audio).
    function attachAudioNodes() {
        const audioContext = audioContextRef.current;
        const zeroGainNode = zeroGainNodeRef.current;
        const mediaNode = mediaNodeRef.current;
        if (audioContext && zeroGainNode && mediaNode) {
            props.player.mountAudioNode(audioContext, zeroGainNode, mediaNode);
        }
        else {
            console.warn("Couldn't mount audio node, this might affect the audio playback when using multiple video views with the same player.");
        }
    }
    function detachAudioNodes() {
        const audioContext = audioContextRef.current;
        const mediaNode = mediaNodeRef.current;
        if (audioContext && mediaNode && videoRef.current) {
            props.player.unmountAudioNode(videoRef.current, audioContext, mediaNode);
        }
    }
    function maybeSetupAudioContext() {
        if (!hasToSetupAudioContext.current ||
            !navigator.userActivation.hasBeenActive ||
            !videoRef.current) {
            return;
        }
        const audioContext = createAudioContext();
        detachAudioNodes();
        audioContextRef.current = audioContext;
        zeroGainNodeRef.current = createZeroGainNode(audioContextRef.current);
        mediaNodeRef.current = audioContext
            ? audioContext.createMediaElementSource(videoRef.current)
            : null;
        attachAudioNodes();
        hasToSetupAudioContext.current = false;
    }
    useEffect(() => {
        if (videoRef.current) {
            props.player?.mountVideoView(videoRef.current);
        }
        attachAudioNodes();
        return () => {
            if (videoRef.current) {
                props.player?.unmountVideoView(videoRef.current);
            }
            detachAudioNodes();
        };
    }, [props.player]);
    return (<video controls={props.nativeControls ?? true} controlsList={props.allowsFullscreen ? undefined : 'nofullscreen'} crossOrigin="anonymous" style={{
            ...mapStyles(props.style),
            objectFit: props.contentFit,
        }} onPlay={() => {
            maybeSetupAudioContext();
        }} 
    // The player can autoplay when muted, unmuting by a user should create the audio context
    onVolumeChange={() => {
            maybeSetupAudioContext();
        }} ref={(newRef) => {
            // This is called with a null value before `player.unmountVideoView` is called,
            // we can't assign null to videoRef if we want to unmount it from the player.
            if (newRef && !newRef.isEqualNode(videoRef.current)) {
                videoRef.current = newRef;
                hasToSetupAudioContext.current = true;
                maybeSetupAudioContext();
            }
        }} disablePictureInPicture={!props.allowsPictureInPicture} src={getSourceUri(props.player?.src) ?? ''}/>);
});
export default VideoView;
//# sourceMappingURL=VideoView.web.js.map