import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Balok abu berdenyut untuk data yang belum tiba.
///
/// Tanpa paket shimmer — satu AnimationController sudah cukup. [color] ada
/// karena halaman Log Historis memakai tema gelap sendiri: balok AppColors.border
/// yang terang akan menyala di sana.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.radius = 8,
    this.color,
  });

  /// null = melebar mengikuti ruang yang tersedia. Di dalam Row wajib diisi
  /// (atau dibungkus Expanded), karena lebar Row tidak terbatas.
  final double? width;
  final double height;
  final double radius;
  final Color? color;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.35, end: 1).animate(_controller),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: widget.color ?? AppColors.border,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}
