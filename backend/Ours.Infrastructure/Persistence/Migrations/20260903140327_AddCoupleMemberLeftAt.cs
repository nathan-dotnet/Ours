using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCoupleMemberLeftAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CoupleMembers_UserId",
                table: "CoupleMembers");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LeftAt",
                table: "CoupleMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CoupleMembers_UserId",
                table: "CoupleMembers",
                column: "UserId",
                unique: true,
                filter: "\"LeftAt\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CoupleMembers_UserId",
                table: "CoupleMembers");

            migrationBuilder.DropColumn(
                name: "LeftAt",
                table: "CoupleMembers");

            migrationBuilder.CreateIndex(
                name: "IX_CoupleMembers_UserId",
                table: "CoupleMembers",
                column: "UserId",
                unique: true);
        }
    }
}
