import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type JSX,
} from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { Lipsync, VISEMES } from "wawa-lipsync";
import { SkeletonUtils } from "three-stdlib";
import type { GLTF } from "three-stdlib";
import * as THREE from "three";

type ActionName =
  | "allGrip_L"
  | "allGrip_R"
  | "allOpen_L"
  | "allOpen_R"
  | "idle_eyes_2"
  | "idle_eyes"
  | "indexDown_L"
  | "indexDown_R"
  | "mrpDown_L"
  | "mrpDown_R"
  | "pinch_L"
  | "pinch_R"
  | "point_L"
  | "point_R"
  | "thumbDown_L"
  | "thumbDown_R"
  | "thumbsUp_L"
  | "thumbsUp_R";

interface GLTFAction extends THREE.AnimationClip {
  name: ActionName;
}

type GLTFResult = GLTF & {
  nodes: {
    Wolf3D_Hands: THREE.SkinnedMesh;
    Wolf3D_Hair: THREE.SkinnedMesh;
    Wolf3D_Shirt: THREE.SkinnedMesh;
    EyeLeft: THREE.SkinnedMesh;
    EyeRight: THREE.SkinnedMesh;
    Wolf3D_Head: THREE.SkinnedMesh;
    Wolf3D_Teeth: THREE.SkinnedMesh;
    Hips: THREE.Bone;
  };
  materials: {
    Wolf3D_Skin: THREE.MeshStandardMaterial;
    Wolf3D_Hair: THREE.MeshStandardMaterial;
    Wolf3D_Shirt: THREE.MeshStandardMaterial;
    Wolf3D_Eye: THREE.MeshStandardMaterial;
    Wolf3D_Teeth: THREE.MeshStandardMaterial;
  };
  animations: GLTFAction[];
};

type LipSyncAvatarProps = JSX.IntrinsicElements["group"] & {
  audioElement?: HTMLAudioElement | null;
};

export type LipSyncAvatarHandle = {
  playAnimation: (animationName: ActionName) => void;
};

export const LipSyncAvatar = forwardRef<
  LipSyncAvatarHandle,
  LipSyncAvatarProps
>(({ audioElement, ...props }, ref) => {
  const group = useRef<THREE.Group>(null);
  const { scene, materials, animations } = useGLTF(
    "/avatar.glb"
  ) as unknown as GLTFResult;
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as unknown as {
    nodes: GLTFResult["nodes"];
  };

  // Animation setup
  const { actions, mixer } = useAnimations(animations, group);

  // Default to idle_eyes animation if available, otherwise use the first animation
  const idleAnimation: ActionName = useMemo(() => {
    if (animations.find((a) => a.name === "idle_eyes")) return "idle_eyes";
    if (animations.find((a) => a.name === "idle_eyes_2")) return "idle_eyes_2";
    return (animations[0]?.name as ActionName) || "idle_eyes";
  }, [animations]);

  const [currentAnimation, setCurrentAnimation] =
    useState<ActionName>(idleAnimation);

  // Helper to play idle animation
  const playIdle = useCallback(() => {
    const action = actions[idleAnimation];
    if (!action) {
      console.warn(`Animation "${idleAnimation}" not found`);
      return;
    }

    // Check if any other actions are currently playing
    const hasActiveActions = Object.values(actions).some(
      (a) => a?.isRunning() && a !== action
    );

    const fadeDuration = hasActiveActions ? 0.5 : 0;
    action
      .reset()
      .fadeIn(fadeDuration)
      .setLoop(THREE.LoopRepeat, Infinity)
      .play();
  }, [actions, idleAnimation]);

  // Expose playAnimation method via ref
  useImperativeHandle(
    ref,
    () => ({
      playAnimation: (animationName: ActionName) => {
        const action = actions[animationName];
        if (!action) {
          console.warn(`Animation "${animationName}" not found`);
          return;
        }

        // Stop current animation
        const currentAction = actions[currentAnimation];
        if (currentAction) {
          currentAction.fadeOut(0.3);
        }

        // Play the requested an  imation once
        action.reset().fadeIn(0.3).setLoop(THREE.LoopOnce, 1).play();
        setCurrentAnimation(animationName);

        // Set up listener to return to idle when animation finishes
        const onFinished = () => {
          mixer.removeEventListener("finished", onFinished);
          setCurrentAnimation(idleAnimation);
        };
        mixer.addEventListener("finished", onFinished);
      },
    }),
    [actions, currentAnimation, idleAnimation, mixer]
  );

  // Play idle animation on mount and when returning to idle
  useEffect(() => {
    if (currentAnimation === idleAnimation) {
      playIdle();
    }
  }, [currentAnimation, idleAnimation, playIdle]);

  // Create a single Lipsync instance
  const lipsyncManager = useMemo(() => new Lipsync(), []);
  const connectedAudioRef = useRef<HTMLAudioElement | null>(null);

  // Connect audio element to lip-sync analyzer
  useEffect(() => {
    if (!audioElement) {
      return;
    }

    // Only connect if it's a different audio element or hasn't been connected yet
    if (connectedAudioRef.current !== audioElement) {
      try {
        lipsyncManager.connectAudio(audioElement);
        connectedAudioRef.current = audioElement;
        console.log("[LipSyncAvatar] Connected audio element to lipsync");
      } catch (error) {
        console.error(
          "[LipSyncAvatar] Failed to connect audio element:",
          error
        );
      }
    }

    return () => {
      // Don't disconnect on cleanup to avoid audio issues
      // The connection will be reused or replaced when needed
    };
  }, [audioElement, lipsyncManager]);

  // Helper to lerp morph target values across all meshes in the scene
  const lerpMorphTarget = (target: string, value: number, speed = 0.1) => {
    clone.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.morphTargetDictionary) {
        const index = child.morphTargetDictionary[target];
        if (
          index === undefined ||
          child.morphTargetInfluences === undefined ||
          child.morphTargetInfluences[index] === undefined
        ) {
          return;
        }
        child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
          child.morphTargetInfluences[index],
          value,
          speed * 1.5
        );
      }
    });
  };

  // Process audio and apply visemes in render loop
  useFrame(() => {
    if (!audioElement || !connectedAudioRef.current) {
      return;
    }

    // Process audio to get current viseme (returns a string like "viseme_O")
    lipsyncManager.processAudio();
    const viseme = lipsyncManager.viseme;
    //@ts-ignore
    const state = lipsyncManager.state;

    if (!viseme) {
      return;
    }

    lerpMorphTarget(viseme, 1, state === "vowel" ? 0.2 : 0.4);

    // Lerp all other visemes to 0
    Object.values(VISEMES).forEach((visemeValue) => {
      if (viseme === visemeValue) {
        return;
      }
      lerpMorphTarget(visemeValue, 0, state === "vowel" ? 0.1 : 0.2);
    });
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene">
        <group name="AvatarRoot">
          <primitive object={nodes.Hips} />
          <skinnedMesh
            name="Wolf3D_Hands"
            geometry={nodes.Wolf3D_Hands.geometry}
            material={materials.Wolf3D_Skin}
            skeleton={nodes.Wolf3D_Hands.skeleton}
          />
          <skinnedMesh
            name="Wolf3D_Hair"
            geometry={nodes.Wolf3D_Hair.geometry}
            material={materials.Wolf3D_Hair}
            skeleton={nodes.Wolf3D_Hair.skeleton}
          />
          <skinnedMesh
            name="Wolf3D_Shirt"
            geometry={nodes.Wolf3D_Shirt.geometry}
            material={materials.Wolf3D_Shirt}
            skeleton={nodes.Wolf3D_Shirt.skeleton}
          />
          <skinnedMesh
            name="EyeLeft"
            geometry={nodes.EyeLeft.geometry}
            material={materials.Wolf3D_Eye}
            skeleton={nodes.EyeLeft.skeleton}
            morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
            morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
          />
          <skinnedMesh
            name="EyeRight"
            geometry={nodes.EyeRight.geometry}
            material={materials.Wolf3D_Eye}
            skeleton={nodes.EyeRight.skeleton}
            morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
            morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
          />
          <skinnedMesh
            name="Wolf3D_Head"
            geometry={nodes.Wolf3D_Head.geometry}
            material={materials.Wolf3D_Skin}
            skeleton={nodes.Wolf3D_Head.skeleton}
            morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
            morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
          />
          <skinnedMesh
            name="Wolf3D_Teeth"
            geometry={nodes.Wolf3D_Teeth.geometry}
            material={materials.Wolf3D_Teeth}
            skeleton={nodes.Wolf3D_Teeth.skeleton}
            morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
            morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
          />
        </group>
      </group>
    </group>
  );
});

LipSyncAvatar.displayName = "LipSyncAvatar";

useGLTF.preload("/avatar.glb");
